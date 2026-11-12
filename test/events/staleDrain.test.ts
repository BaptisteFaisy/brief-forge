/**
 * Drain planifié des briefs périmés.
 *
 * Le contrat testé ici est celui du contexte **planifié** : Forge y refuse
 * GlobalStorage (« Request principal is not authorized to use storage
 * resource »), donc le drain ne doit jamais toucher la file persistante. Il
 * travaille sur la liste SQL des briefs périmés et sur une file en mémoire.
 *
 * La file persistante du harnais est donc une file **interdite** : le moindre
 * accès fait échouer le test.
 */
import { DRAIN_REASON, StaleDrainDeps, drainStaleBriefs } from '../../src/events/staleDrain';
import type { BriefQueuePort, NewQueueEntry, QueueEntry } from '../../src/events/queue';
import { FakeBriefStore, InMemoryStore, RecordingLogger, makeBrief } from './fakes';

const START = Date.UTC(2026, 10, 12, 3, 0, 0);

/** File persistante dont chaque accès échoue, comme en contexte planifié. */
class ForbiddenQueue implements BriefQueuePort {
  /** Nombre d'accès tentés : doit rester à zéro. */
  calls = 0;

  private refuse(): never {
    this.calls += 1;
    throw new Error('Request principal is not authorized to use storage resource');
  }

  async enqueue(_entry: NewQueueEntry): Promise<'added' | 'already-queued'> {
    return this.refuse();
  }

  async list(): Promise<QueueEntry[]> {
    return this.refuse();
  }

  async remove(_issueKey: string): Promise<void> {
    this.refuse();
  }

  async recordFailure(_entry: QueueEntry, _error: string): Promise<'retry' | 'dropped'> {
    return this.refuse();
  }
}

interface Harness {
  deps: StaleDrainDeps;
  store: FakeBriefStore;
  logger: RecordingLogger;
  queue: ForbiddenQueue;
  built: Array<{ issueKey: string; budget: string }>;
}

function harness(
  staleKeys: string[] | (() => Promise<string[]>),
  overrides: Partial<StaleDrainDeps> = {}
): Harness {
  const store = new FakeBriefStore();
  const logger = new RecordingLogger();
  const queue = new ForbiddenQueue();
  const built: Array<{ issueKey: string; budget: string }> = [];
  const deps: StaleDrainDeps = {
    queue,
    store,
    logger,
    now: () => new Date(START),
    buildBrief: async (issueKey, budget) => {
      built.push({ issueKey, budget });
      return makeBrief(issueKey, budget);
    },
    listStaleIssueKeys: async () =>
      typeof staleKeys === 'function' ? staleKeys() : staleKeys,
    ...overrides,
  };
  return { deps, store, logger, queue, built };
}

/** Enregistre les trois budgets d'un ticket comme briefs stockés. */
async function saveAllBudgets(
  store: FakeBriefStore,
  issueKey: string,
  builtAt = '2026-11-12T02:00:00.000Z'
): Promise<void> {
  for (const budget of ['s', 'm', 'l'] as const) {
    await store.saveBrief(makeBrief(issueKey, budget), builtAt);
  }
}

describe('drain planifié des briefs périmés', () => {
  it('ne reconstruit que les tickets périmés, jamais les briefs frais', async () => {
    const { deps, store, built } = harness(['PROJ-1', 'PROJ-2']);
    await saveAllBudgets(store, 'PROJ-1');
    await saveAllBudgets(store, 'PROJ-2');
    store.markStale('PROJ-1');

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual(['PROJ-1', 'PROJ-2']);
    expect(report.enqueued).toEqual(['PROJ-1', 'PROJ-2']);
    expect(report.skipped).toBe(false);
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
    expect(built).toHaveLength(3); // les trois budgets du seul ticket périmé
    expect(report.consume.ok).toBe(true);
  });

  it('n’accède jamais à la file persistante : GlobalStorage est refusé en contexte planifié', async () => {
    const { deps, store, queue, built } = harness(['PROJ-1']);
    await saveAllBudgets(store, 'PROJ-1');
    store.markStale('PROJ-1');

    const report = await drainStaleBriefs(deps);

    expect(queue.calls).toBe(0);
    expect(built).toHaveLength(3);
    expect(report.consume.ok).toBe(true);
  });

  it('respecte le budget de temps : rien n’est construit, le ticket est reporté', async () => {
    const { deps, built } = harness(['PROJ-1'], { timeBudgetMs: 0 });

    const report = await drainStaleBriefs(deps);

    expect(built).toEqual([]);
    expect(report.consume.deferred).toEqual(['PROJ-1']);
    expect(report.skipped).toBe(false);
  });

  it('déduplique : une clé présente deux fois dans la liste SQL n’est construite qu’une fois', async () => {
    const { deps, built } = harness(['PROJ-1', 'PROJ-1']);

    const report = await drainStaleBriefs(deps);

    expect(report.enqueued).toEqual(['PROJ-1', 'PROJ-1']);
    expect(built).toHaveLength(3); // et non 6
  });

  it('ignore les clés illisibles renvoyées par le stockage', async () => {
    const { deps, built } = harness(['PROJ-1', '', '   ']);

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual(['PROJ-1']);
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
  });

  it('liste SQL illisible : le drain n’a aucun effet, le dit, et ne touche à aucun stockage', async () => {
    const { deps, logger, queue, built } = harness(async () => {
      throw new Error('SQL indisponible');
    });

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual([]);
    expect(report.skipped).toBe(true);
    expect(logger.messages('warn')).toEqual(
      expect.arrayContaining([expect.stringContaining('illisible')])
    );
    expect(built).toEqual([]);
    expect(queue.calls).toBe(0);
  });

  it('système sain : un SELECT, un journal, et aucun accès au stockage', async () => {
    const { deps, logger, queue, built } = harness([]);

    const report = await drainStaleBriefs(deps);

    expect(report.skipped).toBe(true);
    expect(built).toEqual([]);
    expect(report.consume.processed).toEqual([]);
    expect(report.consume.ok).toBe(true);
    expect(queue.calls).toBe(0);
    expect(logger.messages('info')).toEqual(
      expect.arrayContaining([expect.stringContaining('aucun brief périmé')])
    );
  });

  it('les entrées reprises portent la raison du drain', async () => {
    const { deps } = harness(['PROJ-1'], { timeBudgetMs: 0 });

    const report = await drainStaleBriefs(deps);

    expect(report.enqueued).toEqual(['PROJ-1']);
    expect(DRAIN_REASON).toBe('scheduled-drain');
    expect(report.consume.deferred).toEqual(['PROJ-1']);
  });

  it('une file persistante fonctionnelle n’est pas requise : le drain passe sans elle', async () => {
    // Contrôle croisé : avec une vraie file en mémoire (aucun refus), le drain
    // se comporte pareil — la preuve qu'il n'en dépend pas.
    const { deps, store, built } = harness(['PROJ-1']);
    const { createQueue } = await import('../../src/events/queue');
    await saveAllBudgets(store, 'PROJ-1');
    store.markStale('PROJ-1');

    const report = await drainStaleBriefs({
      ...deps,
      queue: createQueue(new InMemoryStore(), new RecordingLogger()),
    });

    expect(built).toHaveLength(3);
    expect(report.consume.ok).toBe(true);
  });
});
