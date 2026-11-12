/**
 * File en mémoire : même contrat que la file stockée, sans aucun stockage.
 *
 * Ce module est le support du drain planifié, qui s'exécute dans un contexte où
 * Forge refuse GlobalStorage.
 */
import { MAX_QUEUE_ATTEMPTS } from '../../src/events/queue';
import type { QueueEntry } from '../../src/events/queue';
import { MemoryBriefQueue, memoryQueueFromKeys } from '../../src/events/memoryQueue';
import { RecordingLogger } from './fakes';

const START = Date.UTC(2026, 10, 12, 3, 0, 0);
const now = (): Date => new Date(START);

function entry(issueKey: string, attempts = 0): QueueEntry {
  return {
    issueKey,
    reason: 'scheduled-drain',
    enqueuedAt: new Date(START).toISOString(),
    attempts,
  };
}

describe('file en mémoire', () => {
  it('ajoute, liste et déduplique par ticket', async () => {
    const queue = new MemoryBriefQueue(new RecordingLogger(), now);

    expect(await queue.enqueue({ issueKey: 'PROJ-1', reason: 'scheduled-drain' })).toBe('added');
    expect(await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' })).toBe(
      'already-queued'
    );

    const list = await queue.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(entry('PROJ-1'));
    expect(queue.size).toBe(1);
  });

  it('list renvoie une copie : modifier le résultat ne corrompt pas la file', async () => {
    const queue = new MemoryBriefQueue(new RecordingLogger(), now);
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'scheduled-drain' });

    const list = await queue.list();
    list.push(entry('PROJ-2'));
    list[0].attempts = 99;

    const after = await queue.list();
    expect(after).toHaveLength(1);
    expect(after[0].attempts).toBe(0);
  });

  it('remove supprime le ticket visé et laisse les autres', async () => {
    const queue = new MemoryBriefQueue(new RecordingLogger(), now);
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'scheduled-drain' });
    await queue.enqueue({ issueKey: 'PROJ-2', reason: 'scheduled-drain' });

    await queue.remove('PROJ-1');

    expect((await queue.list()).map((item) => item.issueKey)).toEqual(['PROJ-2']);
    await queue.remove('PROJ-INCONNU'); // sans effet, sans erreur
    expect(queue.size).toBe(1);
  });

  it('recordFailure : réessaie en comptant, puis abandonne au plafond', async () => {
    const logger = new RecordingLogger();
    const queue = new MemoryBriefQueue(logger, now);
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'scheduled-drain' });

    const first = (await queue.list())[0];
    expect(await queue.recordFailure(first, 'panne')).toBe('retry');
    const second = (await queue.list())[0];
    expect(second.attempts).toBe(1);
    expect(second.lastError).toBe('panne');

    expect(await queue.recordFailure(second, 'panne')).toBe('retry');
    const third = (await queue.list())[0];
    expect(third.attempts).toBe(2);

    expect(await queue.recordFailure(third, 'panne')).toBe('dropped');
    expect(await queue.list()).toEqual([]);
    expect(MAX_QUEUE_ATTEMPTS).toBe(3);
    expect(logger.messages('error')).toEqual(
      expect.arrayContaining([expect.stringContaining('Abandon')])
    );
  });

  it('memoryQueueFromKeys amorce la file et déduplique les clés répétées', async () => {
    const queue = await memoryQueueFromKeys(
      ['PROJ-1', 'PROJ-2', 'PROJ-1'],
      'scheduled-drain',
      new RecordingLogger(),
      now
    );

    const list = await queue.list();
    expect(list.map((item) => item.issueKey)).toEqual(['PROJ-1', 'PROJ-2']);
    expect(list.every((item) => item.reason === 'scheduled-drain')).toBe(true);
    expect(queue.size).toBe(2);
  });
});
