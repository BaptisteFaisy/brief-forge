/**
 * File de construction **en mémoire** — pour les contextes sans GlobalStorage.
 *
 * Pourquoi ce module existe : un `scheduledTrigger` s'exécute sans contexte
 * d'installation, et Forge y refuse le stockage global (« Request principal is
 * not authorized to use storage resource » — observé en `development` le 12
 * novembre 2026 sur la fonction `brief-rebuild-sched-fn`). La file persistante
 * est donc inaccessible au drain, alors que Forge SQL, lui, y fonctionne.
 *
 * Le drain n'a pas besoin du journal persistant : la liste SQL des briefs
 * périmés fait autorité. Cette file sert de support au consumer pour une seule
 * exécution, sans rien écrire nulle part.
 *
 * Même contrat que `StorageBriefQueue` (`BriefQueuePort`) : déduplication par
 * ticket, `recordFailure` avec abandon au-delà de `MAX_QUEUE_ATTEMPTS`. La
 * différence assumée : les entrées ne survivent pas à l'exécution — un échec de
 * construction est repris au drain suivant, puisque le brief reste périmé en
 * base.
 */
import {
  BriefQueuePort,
  Logger,
  MAX_QUEUE_ATTEMPTS,
  NewQueueEntry,
  QueueEntry,
  QueueReason,
  consoleLogger,
} from './queue';

/** File en mémoire : même contrat que la file stockée, sans stockage. */
export class MemoryBriefQueue implements BriefQueuePort {
  private entries: QueueEntry[] = [];

  constructor(
    private readonly logger: Logger = consoleLogger,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Nombre d'entrées encore en file (diagnostic et tests). */
  get size(): number {
    return this.entries.length;
  }

  async enqueue(entry: NewQueueEntry): Promise<'added' | 'already-queued'> {
    if (this.entries.some((existing) => existing.issueKey === entry.issueKey)) {
      return 'already-queued';
    }
    this.entries = [
      ...this.entries,
      {
        issueKey: entry.issueKey,
        projectKey: entry.projectKey,
        reason: entry.reason,
        enqueuedAt: this.now().toISOString(),
        attempts: 0,
      },
    ];
    return 'added';
  }

  async list(): Promise<QueueEntry[]> {
    // Copie défensive : un appelant qui modifie un élément reçu ne doit pas
    // pouvoir corrompre l'état de la file (les entrées sont plates).
    return this.entries.map((entry) => ({ ...entry }));
  }

  async remove(issueKey: string): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.issueKey !== issueKey);
  }

  async recordFailure(entry: QueueEntry, error: string): Promise<'retry' | 'dropped'> {
    const attempts = entry.attempts + 1;
    this.entries = this.entries.filter((existing) => existing.issueKey !== entry.issueKey);
    if (attempts >= MAX_QUEUE_ATTEMPTS) {
      this.logger.error(
        `Abandon de la construction du brief ${entry.issueKey} après ${attempts} tentatives`,
        { error }
      );
      return 'dropped';
    }
    this.entries = [...this.entries, { ...entry, attempts, lastError: error }];
    this.logger.warn(
      `Construction du brief ${entry.issueKey} en échec (tentative ${attempts}/${MAX_QUEUE_ATTEMPTS})`,
      { error }
    );
    return 'retry';
  }
}

/**
 * File amorcée avec des clés de tickets, toutes de la même raison.
 *
 * La déduplication passe par `enqueue` : deux fois la même clé n'entre qu'une
 * fois, comme dans la file stockée.
 */
export async function memoryQueueFromKeys(
  issueKeys: readonly string[],
  reason: QueueReason,
  logger: Logger = consoleLogger,
  now: () => Date = () => new Date()
): Promise<MemoryBriefQueue> {
  const queue = new MemoryBriefQueue(logger, now);
  for (const issueKey of issueKeys) {
    await queue.enqueue({ issueKey, reason });
  }
  return queue;
}
