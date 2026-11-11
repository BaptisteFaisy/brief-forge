import { InMemoryStore, FakeBriefStore, RecordingLogger, makeBrief } from './fakes';
import { createQueue } from '../../src/events/queue';
import {
  BRIEF_BUDGETS,
  BriefConsumerDeps,
  consumeBriefQueue,
  isBriefStale,
  isStoredBriefStale,
} from '../../src/events/consumer';

const START = Date.UTC(2026, 10, 11, 9, 0, 0);

interface Harness {
  deps: BriefConsumerDeps;
  store: FakeBriefStore;
  logger: RecordingLogger;
  queue: ReturnType<typeof createQueue>;
  built: Array<{ issueKey: string; budget: string }>;
}

function harness(overrides: Partial<BriefConsumerDeps> = {}): Harness {
  const store = new FakeBriefStore();
  const logger = new RecordingLogger();
  const queue = createQueue(new InMemoryStore(), logger);
  const built: Array<{ issueKey: string; budget: string }> = [];
  const deps: BriefConsumerDeps = {
    queue,
    store,
    logger,
    now: () => new Date(START),
    buildBrief: async (issueKey, budget) => {
      built.push({ issueKey, budget });
      return makeBrief(issueKey, budget);
    },
    ...overrides,
  };
  return { deps, store, logger, queue, built };
}

async function queueIssue(queue: ReturnType<typeof createQueue>, issueKey: string) {
  await queue.enqueue({ issueKey, reason: 'comment-added' });
}

describe('constructeur de briefs', () => {
  it('construit et enregistre les trois budgets', async () => {
    const { deps, store, queue, built } = harness();
    await queueIssue(queue, 'PROJ-1');

    const report = await consumeBriefQueue(deps);

    expect(built.map((item) => item.budget)).toEqual([...BRIEF_BUDGETS]);
    expect(store.saved.map((item) => item.budget)).toEqual([...BRIEF_BUDGETS]);
    expect(store.saved[0].builtAt).toBe('2026-11-11T09:00:00.000Z');
    expect(report.processed).toHaveLength(1);
    expect(report.processed[0].status).toBe('built');
    expect(report.ok).toBe(true);
    expect(await queue.list()).toEqual([]);
  });

  it('est idempotent : une file vide ne reconstruit rien', async () => {
    const { deps, queue, built } = harness();
    await queueIssue(queue, 'PROJ-1');
    await consumeBriefQueue(deps);
    built.length = 0;

    const second = await consumeBriefQueue(deps);

    expect(built).toEqual([]);
    expect(second.processed).toEqual([]);
    expect(second.ok).toBe(true);
  });

  it('saute un budget dont le brief stocké est encore frais', async () => {
    const { deps, store, queue, built } = harness();
    await store.saveBrief(makeBrief('PROJ-1', 's'), '2026-11-11T08:59:00.000Z');
    await queueIssue(queue, 'PROJ-1');

    const report = await consumeBriefQueue(deps);

    expect(built.map((item) => item.budget)).toEqual(['m', 'l']);
    expect(report.processed[0].budgets[0]).toEqual({ budget: 's', built: false, skipped: 'fresh' });
  });

  it('journalise une erreur de construction et garde le ticket en file', async () => {
    const { deps, logger, queue } = harness({
      buildBrief: async (issueKey, budget) => {
        if (budget === 'm') throw new Error('Jira a répondu 503');
        return makeBrief(issueKey, budget);
      },
    });
    await queueIssue(queue, 'PROJ-1');

    const report = await consumeBriefQueue(deps);

    expect(report.ok).toBe(false);
    expect(report.processed[0].status).toBe('failed');
    expect(logger.messages('error')).toEqual(
      expect.arrayContaining([expect.stringContaining('budget m')])
    );
    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toContain('Jira a répondu 503');
  });

  it('rend la main sans construire quand le budget temps est déjà épuisé', async () => {
    const { deps, queue, built } = harness({ timeBudgetMs: 0 });
    await queueIssue(queue, 'PROJ-1');

    const report = await consumeBriefQueue(deps);

    expect(built).toEqual([]);
    expect(report.deferred).toEqual(['PROJ-1']);
    expect((await queue.list())[0].attempts).toBe(0);
  });

  it('remet le ticket en file si le temps s’épuise en cours de construction', async () => {
    let clock = 0;
    const { deps, queue } = harness({
      timeBudgetMs: 1000,
      now: () => new Date(START + clock),
      buildBrief: async (issueKey, budget) => {
        clock += 2000;
        return makeBrief(issueKey, budget);
      },
    });
    await queueIssue(queue, 'PROJ-1');

    const report = await consumeBriefQueue(deps);

    expect(report.processed[0].status).toBe('deferred');
    expect(report.processed[0].budgets).toHaveLength(1);
    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(0);
  });

  it('respecte le plafond de tickets par exécution', async () => {
    const { deps, queue, built } = harness({ maxIssuesPerRun: 1 });
    await queueIssue(queue, 'PROJ-1');
    await queueIssue(queue, 'PROJ-2');

    const report = await consumeBriefQueue(deps);

    expect(report.deferred).toEqual(['PROJ-2']);
    expect(new Set(built.map((item) => item.issueKey))).toEqual(new Set(['PROJ-1']));
    expect((await queue.list()).map((entry) => entry.issueKey)).toEqual(['PROJ-2']);
  });

  it('expose l’état de péremption utilisé par post-work-report', async () => {
    const store = new FakeBriefStore();

    expect(isBriefStale(null)).toBe(true);
    expect(await isStoredBriefStale(store, 'PROJ-1', 'm')).toBe(true);

    await store.saveBrief(makeBrief('PROJ-1', 'm'), '2026-11-11T09:00:00.000Z');
    expect(await isStoredBriefStale(store, 'PROJ-1', 'm')).toBe(false);

    store.markStale('PROJ-1');
    expect(await isStoredBriefStale(store, 'PROJ-1', 'm')).toBe(true);
  });
});
