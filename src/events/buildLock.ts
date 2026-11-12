/**
 * Verrou de construction par ticket (idempotence du consumer).
 *
 * Deux exécutions du consumer peuvent viser le même ticket : deux messages de
 * la file platform, un message de la file **et** le drain planifié, ou deux
 * messages reçus pendant une construction. Sans verrou, le même brief est
 * construit deux fois — pas de dégât, mais deux fois le coût LLM et le quota
 * SQL (contrainte Forge sur les quotas).
 *
 * Propriétés tenues :
 * - **par ticket** : deux tickets différents ne se bloquent jamais ;
 * - **expirant** : un consumer planté ne bloque pas un ticket indéfiniment
 *   (`BUILD_LOCK_TTL_MS`) ;
 * - **relâché dans un `finally`** : la libération suit la construction, qu'elle
 *   réussisse ou échoue.
 *
 * Choix de stockage : une clé GlobalStorage **par ticket**
 * (`brief-forge:build-lock:<clé>`), ce qui évite de sérialiser tous les
 * tickets dans une même valeur et rend la libération ciblée. L'API
 * clé/valeur de Forge n'offre pas de comparaison-échange : l'acquisition est
 * donc « lire, décider, écrire » — la même convention que la déduplication de
 * `queue.ts`. La fenêtre résiduelle (deux exécutions qui lisent en même temps)
 * ne peut produire qu'une **construction en double**, jamais de corruption :
 * c'est précisément ce que le verrou réduit, et le contrôle de fraîcheur du
 * consumer reste la barrière de fond.
 */

import { randomUUID } from 'crypto';
import { KeyValueStore, Logger, consoleLogger } from './queue';

/** Préfixe des clés GlobalStorage : un verrou par ticket. */
export const BUILD_LOCK_KEY_PREFIX = 'brief-forge:build-lock:';

/**
 * Durée de vie d'un verrou (5 minutes).
 *
 * Justification : le consumer construit trois budgets par ticket dans un
 * budget de temps de 96 s (`DEFAULT_CONSUMER_TIME_BUDGET_MS`) ; cinq minutes
 * couvrent largement une construction en cours — le verrou ne saute donc pas
 * au milieu d'un build — tout en libérant le ticket en moins de cinq minutes
 * si l'exécution est morte (pas de `finally` joué).
 */
export const BUILD_LOCK_TTL_MS = 5 * 60 * 1000;

/** Enregistrement stocké : qui tient le verrou, et jusqu'à quand. */
export interface BuildLockRecord {
  issueKey: string;
  /** Identifiant de l'exécutant : seule cette exécution peut relâcher. */
  owner: string;
  acquiredAt: string;
  expiresAt: string;
}

/** Verrou détenu, à relâcher. */
export interface BuildLock {
  issueKey: string;
  owner: string;
  expiresAt: string;
}

/** Résultat d'une tentative d'acquisition. */
export type LockAttempt =
  | { acquired: true; lock: BuildLock }
  | { acquired: false; heldUntil: string };

export interface BuildLockPort {
  /** Prend le verrou du ticket, ou signale qu'un autre exécutant le tient. */
  acquire(issueKey: string): Promise<LockAttempt>;
  /** Relâche le verrou — n'efface jamais celui d'un autre exécutant. */
  release(lock: BuildLock): Promise<void>;
}

/** Clé de stockage du verrou d'un ticket. */
export function buildLockKey(issueKey: string): string {
  return `${BUILD_LOCK_KEY_PREFIX}${issueKey}`;
}

function isLockRecord(value: unknown): value is BuildLockRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.issueKey === 'string' &&
    typeof record.owner === 'string' &&
    typeof record.expiresAt === 'string'
  );
}

/** Un verrou est expiré quand son échéance est dépassée (ou illisible). */
export function isLockExpired(expiresAt: string, now: Date): boolean {
  const deadline = new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) return true;
  return deadline <= now.getTime();
}

/**
 * Verrou stocké dans GlobalStorage (une clé par ticket).
 *
 * Les opérations d'un même isolate sont sérialisées : deux acquisitions
 * concurrentes du même ticket dans une même exécution ne peuvent pas se
 * croiser (la seconde voit le verrou de la première). Entre deux exécutions
 * Forge distinctes, la sérialisation n'existe pas — d'où la relecture de
 * confirmation après écriture (`owner` relu) qui fait perdre la course au
 * perdant quand elle est détectable.
 */
export class StorageBuildLock implements BuildLockPort {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs: number = BUILD_LOCK_TTL_MS,
    private readonly ownerId: () => string = () => randomUUID()
  ) {}

  async acquire(issueKey: string): Promise<LockAttempt> {
    return this.serialize(() => this.tryAcquire(issueKey));
  }

  async release(lock: BuildLock): Promise<void> {
    await this.serialize(() => this.deleteIfOwner(lock));
  }

  /** Exécute les opérations du verrou l'une après l'autre (par isolate). */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async tryAcquire(issueKey: string): Promise<LockAttempt> {
    const key = buildLockKey(issueKey);
    const current = await this.store.get(key);
    const now = this.now();
    if (isLockRecord(current) && !isLockExpired(current.expiresAt, now)) {
      this.logger.info(`Construction du brief ${issueKey} déjà en cours : verrou laissé`, {
        issueKey,
        heldUntil: current.expiresAt,
      });
      return { acquired: false, heldUntil: current.expiresAt };
    }
    if (isLockRecord(current)) {
      this.logger.warn(`Verrou de ${issueKey} expiré : repris`, {
        issueKey,
        expiresAt: current.expiresAt,
      });
    }
    const record: BuildLockRecord = {
      issueKey,
      owner: this.ownerId(),
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    await this.store.set(key, record);
    const confirmed = await this.store.get(key);
    if (!isLockRecord(confirmed) || confirmed.owner !== record.owner) {
      const heldUntil = isLockRecord(confirmed) ? confirmed.expiresAt : record.expiresAt;
      this.logger.warn(`Verrou de ${issueKey} perdu au profit d'une autre exécution`, {
        issueKey,
      });
      return { acquired: false, heldUntil };
    }
    this.logger.info(`Verrou de construction pris pour ${issueKey}`, {
      issueKey,
      expiresAt: record.expiresAt,
    });
    return {
      acquired: true,
      lock: { issueKey, owner: record.owner, expiresAt: record.expiresAt },
    };
  }

  private async deleteIfOwner(lock: BuildLock): Promise<void> {
    const key = buildLockKey(lock.issueKey);
    const current = await this.store.get(key);
    if (!isLockRecord(current)) return;
    if (current.owner !== lock.owner) {
      this.logger.warn(`Verrou de ${lock.issueKey} déjà repris : non relâché`, {
        issueKey: lock.issueKey,
      });
      return;
    }
    await this.store.delete(key);
    this.logger.info(`Verrou de construction relâché pour ${lock.issueKey}`, {
      issueKey: lock.issueKey,
    });
  }
}

/** Fabrique de verrou (forme de la file : un objet injectable). */
export function createBuildLock(
  store: KeyValueStore,
  logger: Logger = consoleLogger,
  now: () => Date = () => new Date(),
  ttlMs: number = BUILD_LOCK_TTL_MS
): BuildLockPort {
  return new StorageBuildLock(store, logger, now, ttlMs);
}
