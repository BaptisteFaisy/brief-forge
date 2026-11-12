/**
 * Verrou de construction par ticket : sémantique du verrou et intégration au
 * consumer (deux exécutions simultanées ne construisent qu'une fois).
 */
import { BUILD_LOCK_KEY_PREFIX, BUILD_LOCK_TTL_MS, buildLockKey, createBuildLock } from '../../src/events/buildLock';
import { DEFAULT_CONSUMER_TIME_BUDGET_MS, consumeBriefQueue } from '../../src/events/consumer';
import { createQueue } from '../../src/events/queue';
import { FakeBriefStore, InMemoryStore, RecordingLogger, makeBrief } from './fakes';

const START = Date.UTC(2026, 10, 12, 9, 0, 0);

describe('verrou de construction (buildLock)', () => {
  function newLock(ttlMs?: number) {
    const store = new InMemoryStore();
    const logger = new RecordingLogger();
    let current = START;
    const lock = createBuildLock(store, logger, () => new Date(current), ttlMs);
    return { store, logger, lock, advance: (ms: number) => { current += ms; } };
  }

  it('prend le verrou et écrit son enregistrement sous une clé par ticket', async () => {
    const { store, lock } = newLock();

    const first = await lock.acquire('PROJ-1');

    expect(first.acquired).toBe(true);
    const record = (await store.get(buildLockKey('PROJ-1'))) as { issueKey: string; expiresAt: string };
    expect(record.issueKey).toBe('PROJ-1');
    expect(record.expiresAt).toBe(new Date(START + BUILD_LOCK_TTL_MS).toISOString());
    expect(buildLockKey('PROJ-1')).toBe(`${BUILD_LOCK_KEY_PREFIX}PROJ-1`);
  });

  it('refuse une seconde acquisition tant que le verrou tient', async () => {
    const { lock } = newLock();
    await lock.acquire('PROJ-1');

    const second = await lock.acquire('PROJ-1');

    expect(second.acquired).toBe(false);
    if (!second.acquired) {
      expect(second.heldUntil).toBe(new Date(START + BUILD_LOCK_TTL_MS).toISOString());
    }
  });

  it('ne verrouille pas les autres tickets', async () => {
    const { lock } = newLock();
    await lock.acquire('PROJ-1');

    expect((await lock.acquire('PROJ-2')).acquired).toBe(true);
  });

  it('relâche le verrou : la clé disparaît et un nouveau build est possible', async () => {
    const { store, lock } = newLock();
    const first = await lock.acquire('PROJ-1');

    if (first.acquired) await lock.release(first.lock);

    expect(await store.get(buildLockKey('PROJ-1'))).toBeUndefined();
    expect((await lock.acquire('PROJ-1')).acquired).toBe(true);
  });

  it('un verrou expiré ne bloque pas : il est repris et journalisé', async () => {
    const { logger, lock, advance } = newLock(1000);
    await lock.acquire('PROJ-1');

    advance(1001);
    const second = await lock.acquire('PROJ-1');

    expect(second.acquired).toBe(true);
    expect(logger.messages('warn')).toEqual(
      expect.arrayContaining([expect.stringContaining('expiré')])
    );
  });

  it('ne relâche jamais le verrou repris par un autre exécutant', async () => {
    const { store, lock, advance } = newLock(1000);
    const stale = await lock.acquire('PROJ-1');

    advance(1001);
    const fresh = await lock.acquire('PROJ-1');
    if (stale.acquired) await lock.release(stale.lock);

    expect(await store.get(buildLockKey('PROJ-1'))).toBeDefined();
    expect(fresh.acquired).toBe(true);
  });

  it('couvre largement le budget de temps d’un lot : un build en cours ne perd pas son verrou', () => {
    expect(BUILD_LOCK_TTL_MS).toBeGreaterThan(DEFAULT_CONSUMER_TIME_BUDGET_MS);
  });
});

describe('consumer verrouillé', () => {
  interface Harness {
    deps: Parameters<typeof consumeBriefQueue>[0];
    store: FakeBriefStore;
    kv: InMemoryStore;
    logger: RecordingLogger;
    queue: ReturnType<typeof createQueue>;
    built: Array<{ issueKey: string; budget: string }>;
  }

  function harness(): Harness {
    const kv = new InMemoryStore();
    const store = new FakeBriefStore();
    const logger = new RecordingLogger();
    const queue = createQueue(kv, logger);
    const lock = createBuildLock(kv, logger);
    const built: Array<{ issueKey: string; budget: string }> = [];
    return {
      deps: {
        queue,
        store,
        lock,
        logger,
        now: () => new Date(START),
        buildBrief: async (issueKey, budget) => {
          built.push({ issueKey, budget });
          return makeBrief(issueKey, budget);
        },
      },
      store,
      kv,
      logger,
      queue,
      built,
    };
  }

  it('deux consumers simultanés : un seul construit le brief', async () => {
    const { deps, queue, built } = harness();
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });

    const [first, second] = await Promise.all([
      consumeBriefQueue(deps),
      consumeBriefQueue(deps),
    ]);

    // Trois budgets construits une seule fois, par le gagnant du verrou.
    expect(built).toHaveLength(3);
    expect(first.processed[0].status).toBe('built');
    expect(second.processed[0].status).toBe('locked');
    expect(second.processed[0].budgets).toEqual([]);
    expect(second.ok).toBe(true);
    expect(await queue.list()).toEqual([]);
  });

  it('verrou déjà tenu : l’entrée reste en file, sans tentative consommée', async () => {
    const { deps, kv, logger, queue, built } = harness();
    const manual = createBuildLock(kv, logger);
    await manual.acquire('PROJ-1');
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'issue-updated' });

    const report = await consumeBriefQueue(deps);

    expect(built).toEqual([]);
    expect(report.processed[0].status).toBe('locked');
    const remaining = await queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(0);
  });

  it('relâche le verrou dans finally, même quand la construction échoue', async () => {
    const { deps, kv, queue } = harness();
    deps.buildBrief = async () => {
      throw new Error('LLM indisponible');
    };
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });

    const report = await consumeBriefQueue(deps);

    expect(report.processed[0].status).toBe('failed');
    expect(await kv.get(buildLockKey('PROJ-1'))).toBeUndefined();
    // Le ticket reste rejouable : le verrou libéré, un nouveau lot peut le reprendre.
    expect((await queue.list())[0].attempts).toBe(1);
  });

  it('une panne du verrou ne bloque pas la construction (fail-open)', async () => {
    const { deps, queue, built } = harness();
    deps.lock = {
      acquire: async () => {
        throw new Error('GlobalStorage indisponible');
      },
      release: async () => undefined,
    };
    await queue.enqueue({ issueKey: 'PROJ-1', reason: 'comment-added' });

    const report = await consumeBriefQueue(deps);

    expect(built).toHaveLength(3);
    expect(report.processed[0].status).toBe('built');
  });
});
