/**
 * File platform Forge (`@forge/events`) — le maillon qui déclenche vraiment le
 * consumer.
 *
 * Le manifest déclare un `consumer` sur la file `brief-build-queue` : pour que
 * Forge invoque `brief-builder-consumer`, un message doit être poussé sur
 * cette file **platform**. La file `GlobalStorage` (`queue.ts`) reste le
 * journal dédupliqué des tickets en attente, mais elle ne déclenche rien.
 *
 * Ce module fournit :
 * - `createForgePlatformPusher` : pousse un message via `@forge/events`
 *   (import paresseux, comme `issueCollector.ts` avec `@forge/api` — les tests
 *   passent sans que le paquet soit installé) ;
 * - `withPlatformPush` : décorateur de `BriefQueuePort` qui pousse sur la file
 *   platform à chaque mise en file. Un échec de push est **journalisé, jamais
 *   propagé** : le trigger continue et le brief se construira à la volée.
 */
import {
  BriefQueuePort,
  Logger,
  NewQueueEntry,
  QueueEntry,
  QueueReason,
  consoleLogger,
  describeError,
} from './queue';

/** Nom de la file platform, identique au champ `queue` du manifest. */
export const BRIEF_BUILD_QUEUE = 'brief-build-queue';

/** Valeurs valides de `reason` (type `QueueReason` de `queue.ts`). */
export const QUEUE_REASONS: readonly QueueReason[] = [
  'issue-updated',
  'comment-added',
  'issue-link-created',
  'issue-link-deleted',
];

/** Charge poussée sur la file platform : le strict nécessaire au consumer. */
export interface PlatformQueuePayload {
  issueKey: string;
  projectKey?: string;
  reason: QueueReason;
}

/** Type minimal de `@forge/events` : évite d'exiger le paquet pour compiler. */
export interface ForgeQueueLike {
  push(payload: Record<string, unknown>): Promise<unknown>;
}

export interface ForgeEventsPackage {
  Queue: new (name: string) => ForgeQueueLike;
}

export interface PlatformQueuePusher {
  push(payload: PlatformQueuePayload): Promise<void>;
}

function defaultLoader(): ForgeEventsPackage {
  // Chargement paresseux : hors runtime Forge (tests), `require` échoue et
  // l'appelant journalise — jamais d'import statique de `@forge/events`.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@forge/events') as ForgeEventsPackage;
}

export interface PlatformPusherOptions {
  queueName?: string;
  loader?: () => ForgeEventsPackage;
}

/** Pousseur réel : `new Queue('brief-build-queue').push(payload)` à l'appel. */
export function createForgePlatformPusher(options: PlatformPusherOptions = {}): PlatformQueuePusher {
  const queueName = options.queueName ?? BRIEF_BUILD_QUEUE;
  const load = options.loader ?? defaultLoader;
  return {
    push: async (payload) => {
      const queue = new (load().Queue)(queueName);
      await queue.push({ ...payload });
    },
  };
}

/**
 * Décore une file `GlobalStorage` : chaque `enqueue` pousse aussi le message
 * sur la file platform (même en cas de doublon local — un push précédent a pu
 * échouer, et le consumer est idempotent). Un échec de push n'échoue jamais
 * l'appel : il est journalisé en `warn`.
 */
export function withPlatformPush(
  inner: BriefQueuePort,
  pusher: PlatformQueuePusher,
  logger: Logger = consoleLogger
): BriefQueuePort {
  return {
    async enqueue(entry: NewQueueEntry): Promise<'added' | 'already-queued'> {
      const result = await inner.enqueue(entry);
      try {
        await pusher.push({
          issueKey: entry.issueKey,
          projectKey: entry.projectKey,
          reason: entry.reason,
        });
      } catch (error) {
        logger.warn(
          `Push platform échoué pour ${entry.issueKey} : le brief sera reconstruit à la volée`,
          { issueKey: entry.issueKey, error: describeError(error) }
        );
      }
      return result;
    },
    list: () => inner.list(),
    remove: (issueKey: string) => inner.remove(issueKey),
    recordFailure: (entry: QueueEntry, error: string) => inner.recordFailure(entry, error),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readIssueKey(source: Record<string, unknown>): string | undefined {
  const key = source.issueKey;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

/**
 * Extrait la clé de ticket d'un événement de consumer. `@forge/events` 2+
 * remet un `AsyncEvent` : le message poussé est dans `event.body` (objet ou
 * JSON sérialisé). Tolère aussi un événement à plat (`event.issueKey`) et
 * l'absence d'événement (`undefined` → balayage complet de la file).
 */
export function extractIssueKeyFromEvent(event: unknown): string | undefined {
  if (event === undefined || event === null) return undefined;
  const root = asRecord(event);
  let body = root.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = undefined;
    }
  }
  return readIssueKey(asRecord(body)) ?? readIssueKey(root);
}

/** Lit le `reason` poussé par le trigger ; toute valeur inconnue est ignorée. */
export function extractReasonFromEvent(event: unknown): QueueReason | undefined {
  const root = asRecord(event);
  const candidates = [asRecord(root.body).reason, root.reason];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && (QUEUE_REASONS as readonly string[]).includes(candidate)) {
      return candidate as QueueReason;
    }
  }
  return undefined;
}

/** Lit le `projectKey` poussé par le trigger (diagnostic du consumer). */
export function extractProjectKeyFromEvent(event: unknown): string | undefined {
  const root = asRecord(event);
  const candidates = [asRecord(root.body).projectKey, root.projectKey];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return undefined;
}
