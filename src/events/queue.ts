/**
 * File de construction des briefs (stockage Forge).
 *
 * Un trigger Jira ne construit jamais un brief lui-même : il marque le brief
 * stocké comme périmé, puis dépose la clé du ticket dans cette file. Le
 * constructeur (`consumer.ts`) la vide. La file est **dédupliquée par ticket** :
 * un ticket déjà en attente n'y entre pas deux fois, ce qui rend les rafales
 * d'événements (commentaire + mise à jour + lien) inoffensives.
 */

/** Journalisation minimale, injectable pour rester testable hors Forge. */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const LOG_PREFIX = '[brief-forge:events]';

function emit(
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
): void {
  const line = `${LOG_PREFIX} ${message}`;
  const details = context ?? {};
  if (level === 'error') {
    console.error(line, details);
    return;
  }
  if (level === 'warn') {
    console.warn(line, details);
    return;
  }
  console.info(line, details);
}

export const consoleLogger: Logger = {
  info: (message, context) => emit('info', message, context),
  warn: (message, context) => emit('warn', message, context),
  error: (message, context) => emit('error', message, context),
};

/** Rend lisible n'importe quelle erreur jetée (Forge, réseau, code métier). */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'erreur inconnue';
  }
}

/** Sous-ensemble de Forge Storage dont la file a besoin (doublure en test). */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export const QUEUE_STORAGE_KEY = 'brief-forge:build-queue';

/** Au-delà, le ticket est abandonné (erreur journalisée) plutôt que réessayé sans fin. */
export const MAX_QUEUE_ATTEMPTS = 3;

/** Ce qui a mis le ticket dans la file : utile pour le diagnostic. */
export type QueueReason =
  | 'issue-updated'
  | 'comment-added'
  | 'issue-link-created'
  | 'issue-link-deleted';

export interface QueueEntry {
  issueKey: string;
  projectKey?: string;
  reason: QueueReason;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface NewQueueEntry {
  issueKey: string;
  projectKey?: string;
  reason: QueueReason;
}

export interface BriefQueuePort {
  /** `already-queued` traduit la déduplication par ticket. */
  enqueue(entry: NewQueueEntry): Promise<'added' | 'already-queued'>;
  list(): Promise<QueueEntry[]>;
  remove(issueKey: string): Promise<void>;
  /** Incrémente le compteur d'échecs ; supprime l'entrée au-delà du plafond. */
  recordFailure(entry: QueueEntry, error: string): Promise<'retry' | 'dropped'>;
}

function isQueueEntry(value: unknown): value is QueueEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.issueKey === 'string' &&
    typeof record.enqueuedAt === 'string' &&
    typeof record.attempts === 'number' &&
    typeof record.reason === 'string'
  );
}

export class StorageBriefQueue implements BriefQueuePort {
  constructor(
    private readonly store: KeyValueStore,
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(): Promise<QueueEntry[]> {
    const raw = await this.store.get(QUEUE_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isQueueEntry);
  }

  async enqueue(entry: NewQueueEntry): Promise<'added' | 'already-queued'> {
    const entries = await this.list();
    if (entries.some((existing) => existing.issueKey === entry.issueKey)) {
      this.logger.info(`Ticket ${entry.issueKey} déjà dans la file : pas de doublon`, {
        reason: entry.reason,
      });
      return 'already-queued';
    }
    const next: QueueEntry = {
      issueKey: entry.issueKey,
      projectKey: entry.projectKey,
      reason: entry.reason,
      enqueuedAt: this.now().toISOString(),
      attempts: 0,
    };
    await this.write([...entries, next]);
    this.logger.info(`Ticket ${entry.issueKey} ajouté à la file de construction`, {
      reason: entry.reason,
    });
    return 'added';
  }

  async remove(issueKey: string): Promise<void> {
    const entries = await this.list();
    const kept = entries.filter((entry) => entry.issueKey !== issueKey);
    if (kept.length !== entries.length) await this.write(kept);
  }

  async recordFailure(entry: QueueEntry, error: string): Promise<'retry' | 'dropped'> {
    const entries = await this.list();
    const attempts = entry.attempts + 1;
    const others = entries.filter((existing) => existing.issueKey !== entry.issueKey);
    if (attempts >= MAX_QUEUE_ATTEMPTS) {
      await this.write(others);
      this.logger.error(
        `Abandon de la construction du brief ${entry.issueKey} après ${attempts} tentatives`,
        { error }
      );
      return 'dropped';
    }
    await this.write([...others, { ...entry, attempts, lastError: error }]);
    this.logger.warn(
      `Construction du brief ${entry.issueKey} en échec (tentative ${attempts}/${MAX_QUEUE_ATTEMPTS})`,
      { error }
    );
    return 'retry';
  }

  private async write(entries: QueueEntry[]): Promise<void> {
    if (entries.length === 0) {
      await this.store.delete(QUEUE_STORAGE_KEY);
      return;
    }
    await this.store.set(QUEUE_STORAGE_KEY, entries);
  }
}

export function createQueue(
  store: KeyValueStore,
  logger: Logger = consoleLogger,
  now: () => Date = () => new Date()
): BriefQueuePort {
  return new StorageBriefQueue(store, logger, now);
}
