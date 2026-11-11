import { InMemoryStore, RecordingLogger, issueState } from './fakes';
import { createQueue } from '../../src/events/queue';
import {
  DEFAULT_TRIGGER_SETTINGS,
  JIRA_EVENT_KEYS,
  TriggerDeps,
  createIssueCommentedHandler,
  createIssueLinkCreatedHandler,
  createIssueUpdatedHandler,
  createJiraEventHandlers,
  issueKeysFromPayload,
  parseIssueState,
  shouldEnqueue,
} from '../../src/events/triggers';

interface Harness {
  deps: TriggerDeps;
  staleCalls: string[];
  queue: ReturnType<typeof createQueue>;
  logger: RecordingLogger;
}

function harness(
  states: Record<string, ReturnType<typeof issueState>> = {
    'PROJ-1': issueState('PROJ-1', 'Prêt', ['backend']),
  }
): Harness {
  const staleCalls: string[] = [];
  const logger = new RecordingLogger();
  const queue = createQueue(new InMemoryStore(), logger);
  const deps: TriggerDeps = {
    markBriefStale: async (issueKey) => {
      staleCalls.push(issueKey);
    },
    loadIssueState: async (issueKey) => states[issueKey] ?? null,
    loadSettings: async () => DEFAULT_TRIGGER_SETTINGS,
    queue,
    logger,
  };
  return { deps, staleCalls, queue, logger };
}

const commentPayload = {
  issue: { key: 'PROJ-1', fields: { status: { name: 'Prêt' } } },
  comment: { id: '10001', body: 'Une précision importante' },
};

describe('triggers Jira', () => {
  it('un commentaire marque le brief périmé et met le ticket en file', async () => {
    const { deps, staleCalls, queue } = harness();
    const handler = createIssueCommentedHandler(deps);

    const outcomes = await handler(commentPayload);

    expect(staleCalls).toEqual(['PROJ-1']);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      issueKey: 'PROJ-1',
      markedStale: true,
      queueResult: 'added',
      reason: 'comment-added',
    });
    expect((await queue.list()).map((entry) => entry.issueKey)).toEqual(['PROJ-1']);
  });

  it('un ticket au statut déclencheur entre dans la file', async () => {
    const { deps, queue } = harness();
    const handler = createIssueUpdatedHandler(deps);

    const outcomes = await handler({ issue: { key: 'PROJ-1' } });

    expect(outcomes[0].queueResult).toBe('added');
    expect(await queue.list()).toHaveLength(1);
  });

  it("un ticket hors statut n'entre pas dans la file, mais reste périmé", async () => {
    const { deps, staleCalls, queue, logger } = harness({
      'PROJ-2': issueState('PROJ-2', 'En cours', ['backend']),
    });
    const handler = createIssueUpdatedHandler(deps);

    const outcomes = await handler({ issue: { key: 'PROJ-2' } });

    expect(staleCalls).toEqual(['PROJ-2']);
    expect(outcomes[0].queueResult).toBeNull();
    expect(await queue.list()).toEqual([]);
    expect(logger.messages('info')).toEqual(
      expect.arrayContaining([expect.stringContaining('hors déclencheur')])
    );
  });

  it("l'étiquette agent déclenche quel que soit le statut", async () => {
    const { deps, queue } = harness({
      'PROJ-3': issueState('PROJ-3', 'En cours', ['agent']),
    });
    const handler = createIssueCommentedHandler(deps);

    const outcomes = await handler({ issue: { key: 'PROJ-3' } });

    expect(outcomes[0].queueResult).toBe('added');
    expect(await queue.list()).toHaveLength(1);
  });

  it('un lien touché invalide les deux bouts', async () => {
    const { deps, staleCalls } = harness({
      'PROJ-1': issueState('PROJ-1', 'Prêt'),
      'PROJ-9': issueState('PROJ-9', 'Prêt'),
    });
    const handler = createIssueLinkCreatedHandler(deps);

    const outcomes = await handler({
      issue: { key: 'PROJ-1' },
      issueLink: { type: { name: 'blocks' }, outwardIssue: { key: 'PROJ-9' } },
    });

    expect(staleCalls).toEqual(['PROJ-1', 'PROJ-9']);
    expect(outcomes.map((outcome) => outcome.issueKey)).toEqual(['PROJ-1', 'PROJ-9']);
    expect(outcomes.every((outcome) => outcome.queueResult === 'added')).toBe(true);
  });

  it('signale un payload sans clé de ticket sans rien casser', async () => {
    const { deps, staleCalls, logger } = harness();
    const handler = createIssueCommentedHandler(deps);

    expect(await handler({ comment: { id: '1' } })).toEqual([]);
    expect(staleCalls).toEqual([]);
    expect(logger.messages('warn')).toEqual(
      expect.arrayContaining([expect.stringContaining('sans clé de ticket')])
    );
  });

  it('journalise un échec de marquage sans mettre en file', async () => {
    const { deps, queue, logger } = harness();
    deps.markBriefStale = async () => {
      throw new Error('stockage indisponible');
    };

    const outcomes = await createIssueUpdatedHandler(deps)({ issue: { key: 'PROJ-1' } });

    expect(outcomes[0].markedStale).toBe(false);
    expect(outcomes[0].error).toBe('stockage indisponible');
    expect(await queue.list()).toEqual([]);
    expect(logger.messages('error')).toEqual(
      expect.arrayContaining([expect.stringContaining('comme périmé')])
    );
  });

  it('expose une table de handlers alignée sur les clés du manifest', () => {
    const { deps } = harness();
    expect(Object.keys(createJiraEventHandlers(deps))).toEqual([
      JIRA_EVENT_KEYS.issueUpdated,
      JIRA_EVENT_KEYS.issueCommented,
      JIRA_EVENT_KEYS.issueLinkCreated,
      JIRA_EVENT_KEYS.issueLinkDeleted,
    ]);
  });

  it('compare statut et étiquette sans tenir compte des accents ni de la casse', () => {
    const state = issueState('PROJ-1', 'pret', ['Agent']);
    expect(shouldEnqueue(state, DEFAULT_TRIGGER_SETTINGS)).toBe(true);
    expect(shouldEnqueue(issueState('PROJ-1', 'En cours', []), DEFAULT_TRIGGER_SETTINGS)).toBe(
      false
    );
  });

  it('lit les clés et l’état du ticket dans les payloads Jira', () => {
    expect(issueKeysFromPayload(commentPayload)).toEqual(['PROJ-1']);
    expect(
      parseIssueState('PROJ-1', {
        fields: { status: { name: 'Prêt' }, project: { key: 'PROJ' }, labels: ['agent', 3] },
      })
    ).toEqual({ issueKey: 'PROJ-1', projectKey: 'PROJ', status: 'Prêt', labels: ['agent'] });
    expect(parseIssueState('PROJ-1', { fields: {} })).toBeNull();
  });
});
