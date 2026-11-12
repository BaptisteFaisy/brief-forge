/**
 * Drain planifié des briefs périmés : ne reconstruit que ce qui est périmé,
 * dans le budget de temps du consumer, et survit à une liste illisible.
 */
import { DRAIN_REASON, StaleDrainDeps, drainStaleBriefs } from '../../src/events/staleDrain';
import { createQueue } from '../../src/events/queue';
import { FakeBriefStore, InMemoryStore, RecordingLogger, makeBrief } from './fakes';

const START = Date.UTC(2026, 10, 12, 3, 0, 0);

interface Harness {
  deps: StaleDrainDeps;
  store: FakeBriefStore;
  logger: RecordingLogger;
  queue: ReturnType<typeof createQueue>;
  built: Array<{ issueKey: string; budget: string }>;
}

function harness(
  staleKeys: string[] | (() => Promise<string[]>),
  overrides: Partial<StaleDrainDeps> = {}
): Harness {
  const store = new FakeBriefStore();
  const logger = new RecordingLogger();
  const queue = createQueue(new InMemoryStore(), logger);
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

describe('drain planifié des briefs périmés', () => {
  it('ne reconstruit que les tickets périmés, jamais les briefs frais', async () => {
    const { deps, store, built } = harness(['PROJ-1', 'PROJ-2']);
    for (const budget of ['s', 'm', 'l'] as const) {
      await store.saveBrief(makeBrief('PROJ-1', budget), '2026-11-12T02:00:00.000Z');
      await store.saveBrief(makeBrief('PROJ-2', budget), '2026-11-12T02:00:00.000Z');
    }
    store.markStale('PROJ-1');

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual(['PROJ-1', 'PROJ-2']);
    expect(report.enqueued).toEqual(['PROJ-1', 'PROJ-2']);
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
    expect(built).toHaveLength(3); // les trois budgets du ticket périmé
    expect(report.consume.ok).toBe(true);
  });

  it('respecte le budget de temps : rien n’est construit, le ticket reste en file', async () => {
    const { deps, queue, built } = harness(['PROJ-1'], { timeBudgetMs: 0 });

    const report = await drainStaleBriefs(deps);

    expect(built).toEqual([]);
    expect(report.consume.deferred).toEqual(['PROJ-1']);
    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].reason).toBe(DRAIN_REASON);
    expect(remaining[0].attempts).toBe(0);
  });

  it('déduplique : un ticket déjà en file n’y entre pas deux fois', async () => {
    const { deps, queue, built } = harness(['PROJ-1']);
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });

    const report = await drainStaleBriefs(deps);

    expect(report.enqueued).toEqual([]); // déjà en file : pas de doublon
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
    expect(await queue.list()).toEqual([]); // la file a été vidée par le consumer
  });

  it('ignore les clés illisibles renvoyées par le stockage', async () => {
    const { deps, built } = harness(['PROJ-1', '', '   ']);

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual(['PROJ-1']);
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
  });

  it('une liste illisible n’empêche pas de vider la file existante', async () => {
    const { deps, logger, queue, built } = harness(async () => {
      throw new Error('SQL indisponible');
    });
    await queue.enqueue({ issueKey: 'PROJ-9', reason: 'issue-updated' });

    const report = await drainStaleBriefs(deps);

    expect(report.staleIssueKeys).toEqual([]);
    expect(logger.messages('warn')).toEqual(
      expect.arrayContaining([expect.stringContaining('illisible')])
    );
    // Le ticket en attente dans la file est quand même reconstruit.
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-9']));
    expect(await queue.list()).toEqual([]);
  });

  it('sans brief périmé ni file : le drain ne fait rien', async () => {
    const { deps, built } = harness([]);

    const report = await drainStaleBriefs(deps);

    expect(built).toEqual([]);
    expect(report.consume.processed).toEqual([]);
    expect(report.consume.ok).toBe(true);
  });
});
