import {
  MAX_QUEUE_ATTEMPTS,
  QUEUE_STORAGE_KEY,
  QueueEntry,
  createQueue,
} from '../../src/events/queue';
import { InMemoryStore, RecordingLogger } from './fakes';

function newQueue() {
  const store = new InMemoryStore();
  const logger = new RecordingLogger();
  const now = () => new Date('2026-11-11T09:00:00.000Z');
  return { store, logger, queue: createQueue(store, logger, now) };
}

describe('file de construction des briefs', () => {
  it('déduplique par ticket', async () => {
    const { queue, logger } = newQueue();

    const first = await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });
    const second = await queue.enqueue({ issueKey: 'PROJ-1', reason: 'issue-updated' });

    expect(first).toBe('added');
    expect(second).toBe('already-queued');
    const entries = await queue.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].issueKey).toBe('PROJ-1');
    expect(entries[0].attempts).toBe(0);
    expect(entries[0].enqueuedAt).toBe('2026-11-11T09:00:00.000Z');
    expect(logger.messages('info')).toEqual(
      expect.arrayContaining([expect.stringContaining('déjà dans la file')])
    );
  });

  it('accepte deux tickets différents', async () => {
    const { queue } = newQueue();
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });
    await queue.enqueue({ issueKey: 'PROJ-2', reason: 'issue-link-created' });

    const keys = (await queue.list()).map((entry) => entry.issueKey);
    expect(keys).toEqual(['PROJ-1', 'PROJ-2']);
  });

  it('retire un ticket de la file', async () => {
    const { queue, store } = newQueue();
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });
    await queue.remove('PROJ-1');

    expect(await queue.list()).toEqual([]);
    expect(store.values.has(QUEUE_STORAGE_KEY)).toBe(false);
  });

  it('compte les échecs puis abandonne au plafond', async () => {
    const { queue, logger } = newQueue();
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });
    let entry = (await queue.list())[0] as QueueEntry;

    const retry = await queue.recordFailure(entry, 'Jira indisponible');
    expect(retry).toBe('retry');
    entry = (await queue.list())[0];
    expect(entry.attempts).toBe(1);
    expect(entry.lastError).toBe('Jira indisponible');

    for (let attempt = 1; attempt < MAX_QUEUE_ATTEMPTS - 1; attempt += 1) {
      await queue.recordFailure((await queue.list())[0], 'Jira indisponible');
    }
    const dropped = await queue.recordFailure((await queue.list())[0], 'Jira indisponible');

    expect(dropped).toBe('dropped');
    expect(await queue.list()).toEqual([]);
    expect(logger.messages('error')).toEqual(
      expect.arrayContaining([expect.stringContaining('Abandon de la construction')])
    );
  });

  it('ignore une valeur de stockage corrompue', async () => {
    const { queue, store } = newQueue();
    await store.set(QUEUE_STORAGE_KEY, [{ issueKey: 42 }, 'nawak']);

    expect(await queue.list()).toEqual([]);
  });
});
