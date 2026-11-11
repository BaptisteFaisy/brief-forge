/**
 * File platform `brief-build-queue` : le push qui déclenche réellement le
 * consumer Forge, sa tolérance aux échecs, et l'extraction du message côté
 * consumer (`AsyncEvent.body`). Aucun réseau, aucun paquet `@forge/events`
 * installé : tout passe par des doublures injectées.
 */
import { FakeBriefStore, InMemoryStore, RecordingLogger, issueState, makeBrief } from './fakes';
import {
  BRIEF_BUILD_QUEUE,
  ForgeEventsPackage,
  ForgeQueueLike,
  PlatformQueuePayload,
  createForgePlatformPusher,
  extractIssueKeyFromEvent,
} from '../../src/events/platformQueue';
import { createQueue } from '../../src/events/queue';
import { DEFAULT_TRIGGER_SETTINGS } from '../../src/events/triggers';
import { BRIEF_BUDGETS } from '../../src/events/consumer';
import { createEventHandlers, runConsumerForEvent } from '../../src/events/index';

/** Doublure de `@forge/events` : enregistre le nom de file et les charges. */
function fakeForgeEvents(options: { failPush?: boolean } = {}) {
  const queueNames: string[] = [];
  const pushed: Array<Record<string, unknown>> = [];
  const events: ForgeEventsPackage = {
    Queue: class implements ForgeQueueLike {
      constructor(name: string) {
        queueNames.push(name);
      }
      async push(payload: Record<string, unknown>): Promise<void> {
        if (options.failPush) throw new Error('file platform indisponible');
        pushed.push(payload);
      }
    },
  };
  return { events, queueNames, pushed };
}

function triggerHarness(platformPush?: { push(payload: PlatformQueuePayload): Promise<void> }) {
  const logger = new RecordingLogger();
  const queue = createQueue(new InMemoryStore(), logger);
  const pushes: PlatformQueuePayload[] = [];
  const pusher = platformPush ?? {
    push: async (payload: PlatformQueuePayload) => {
      pushes.push(payload);
    },
  };
  const handlers = createEventHandlers({
    queue,
    platformPush: pusher,
    logger,
    markBriefStale: async () => undefined,
    loadIssueState: async (issueKey) =>
      issueKey === 'PROJ-1' ? issueState('PROJ-1', 'Prêt', ['backend']) : issueState(issueKey, 'En cours'),
    loadSettings: async () => DEFAULT_TRIGGER_SETTINGS,
  });
  return { handlers, queue, logger, pushes };
}

describe('file platform brief-build-queue', () => {
  it('pousse via @forge/events avec le bon nom de file et la bonne charge', async () => {
    const fake = fakeForgeEvents();
    const pusher = createForgePlatformPusher({ loader: () => fake.events });

    await pusher.push({ issueKey: 'PROJ-1', projectKey: 'PROJ', reason: 'comment-added' });

    expect(fake.queueNames).toEqual([BRIEF_BUILD_QUEUE]);
    expect(fake.pushed).toEqual([
      { issueKey: 'PROJ-1', projectKey: 'PROJ', reason: 'comment-added' },
    ]);
  });

  it('un trigger déclenché pousse le ticket sur la file platform', async () => {
    const { handlers, pushes, queue } = triggerHarness();

    const outcomes = await handlers['avi:jira:commented:issue']({ issue: { key: 'PROJ-1' } });

    expect(outcomes[0].queueResult).toBe('added');
    expect(pushes).toEqual([{ issueKey: 'PROJ-1', projectKey: 'PROJ', reason: 'comment-added' }]);
    expect((await queue.list()).map((entry) => entry.issueKey)).toEqual(['PROJ-1']);
  });

  it('un ticket hors déclencheur ne pousse rien', async () => {
    const { handlers, pushes } = triggerHarness();

    const outcomes = await handlers['avi:jira:updated:issue']({ issue: { key: 'PROJ-2' } });

    expect(outcomes[0].queueResult).toBeNull();
    expect(pushes).toEqual([]);
  });

  it("un échec de push est journalisé sans faire échouer le trigger", async () => {
    const fake = fakeForgeEvents({ failPush: true });
    const { handlers, logger, queue } = triggerHarness(
      createForgePlatformPusher({ loader: () => fake.events })
    );

    const outcomes = await handlers['avi:jira:updated:issue']({ issue: { key: 'PROJ-1' } });

    expect(outcomes[0]).toMatchObject({ issueKey: 'PROJ-1', markedStale: true, queueResult: 'added' });
    expect(outcomes[0].error).toBeUndefined();
    expect(await queue.list()).toHaveLength(1);
    expect(logger.messages('warn')).toEqual(
      expect.arrayContaining([expect.stringContaining('Push platform échoué')])
    );
  });
});

describe('événement du consumer (AsyncEvent)', () => {
  it('extrait issueKey depuis event.body, un corps JSON, un événement à plat, ou rien', () => {
    expect(
      extractIssueKeyFromEvent({ body: { issueKey: 'PROJ-1', reason: 'comment-added' }, jobId: 'j1' })
    ).toBe('PROJ-1');
    expect(extractIssueKeyFromEvent({ body: JSON.stringify({ issueKey: 'PROJ-2' }) })).toBe('PROJ-2');
    expect(extractIssueKeyFromEvent({ issueKey: 'PROJ-3' })).toBe('PROJ-3');
    expect(extractIssueKeyFromEvent(undefined)).toBeUndefined();
    expect(extractIssueKeyFromEvent(null)).toBeUndefined();
    expect(extractIssueKeyFromEvent({ body: 'pas-du-json', jobId: 12 })).toBeUndefined();
  });

  function consumerHarness() {
    const logger = new RecordingLogger();
    const queue = createQueue(new InMemoryStore(), logger);
    const store = new FakeBriefStore();
    const built: Array<{ issueKey: string; budget: string }> = [];
    const report = (event?: unknown) =>
      runConsumerForEvent(event, {
        queue,
        store,
        logger,
        buildBrief: async (issueKey, budget) => {
          built.push({ issueKey, budget });
          return makeBrief(issueKey, budget);
        },
      });
    return { queue, store, built, logger, report };
  }

  it("construit les trois budgets du ticket porté par event.body", async () => {
    const { store, built, queue, report } = consumerHarness();

    const result = await report({
      body: { issueKey: 'PROJ-1', projectKey: 'PROJ', reason: 'comment-added' },
      jobId: 'job-1',
    });

    expect(built.map((item) => item.budget)).toEqual([...BRIEF_BUDGETS]);
    expect(store.saved.map((item) => item.issueKey)).toEqual(['PROJ-1', 'PROJ-1', 'PROJ-1']);
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0].status).toBe('built');
    expect(await queue.list()).toEqual([]);
  });

  it('accepte aussi un événement à plat (issueKey à la racine)', async () => {
    const { built, report } = consumerHarness();

    await report({ issueKey: 'PROJ-4' });

    expect(built.map((item) => item.issueKey)).toEqual(['PROJ-4', 'PROJ-4', 'PROJ-4']);
  });

  it('sans événement, balaie toute la file GlobalStorage', async () => {
    const { queue, built, report } = consumerHarness();
    await queue.enqueue({ issueKey: 'PROJ-5', reason: 'issue-updated' });
    await queue.enqueue({ issueKey: 'PROJ-6', reason: 'comment-added' });

    const result = await report();

    expect(result.processed.map((item) => item.issueKey)).toEqual(['PROJ-5', 'PROJ-6']);
    expect(built).toHaveLength(6);
    expect(await queue.list()).toEqual([]);
  });

  it('sans événement et file vide, ne construit rien', async () => {
    const { built, report } = consumerHarness();

    const result = await report();

    expect(built).toEqual([]);
    expect(result.processed).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
