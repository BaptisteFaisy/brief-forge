/**
 * Point d'entrée du module événements.
 *
 * Réexporte les briques (file, triggers, consumer, file platform) et fournit
 * le câblage Forge réel : stockage, lecture Jira, construction de brief et
 * dépôt. Les modules d'autres lots (`../brief/builder`, `../storage`) ne sont
 * résolus qu'à l'appel — les tests n'ont donc jamais besoin du runtime Forge
 * ni d'eux.
 */
export * from './queue';
export * from './triggers';
export * from './consumer';
export * from './platformQueue';

import { BriefData, Budget } from '../types';
import { BriefConsumerDeps, BriefStorePort, ConsumeReport, StoredBriefSummary, consumeBriefQueue } from './consumer';
import {
  PlatformQueuePusher,
  createForgePlatformPusher,
  extractIssueKeyFromEvent,
  extractProjectKeyFromEvent,
  extractReasonFromEvent,
  withPlatformPush,
} from './platformQueue';
import {
  BriefQueuePort,
  KeyValueStore,
  Logger,
  consoleLogger,
  createQueue,
} from './queue';
import {
  IssueState,
  JIRA_EVENT_KEYS,
  JiraEventHandler,
  TriggerDeps,
  TriggerSettings,
  createIssueCommentedHandler,
  createIssueLinkCreatedHandler,
  createIssueLinkDeletedHandler,
  createIssueUpdatedHandler,
  createJiraEventHandlers,
  parseIssueState,
} from './triggers';

/** Contrat attendu du module de stockage (lot WP-storage, contrat § 4.4). */
interface StorageApi {
  markBriefStale(issueKey: string): Promise<void>;
  saveBrief(brief: BriefData, builtAt: string): Promise<void>;
  loadBrief(issueKey: string, budget: Budget): Promise<StoredBriefSummary | null>;
  loadProjectSettings(projectKey: string): Promise<TriggerSettings | null>;
}

/** Contrat attendu du constructeur de brief (lot WP-brief, contrat § 4.2). */
interface BriefApi {
  buildBrief(issueKey: string, budget: Budget): Promise<BriefData>;
}

interface StoragePackage {
  GlobalStorage: new (
    apiClient: unknown,
    getMetrics: () => unknown
  ) => {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

interface ApiPackage {
  __fetchProduct(args: { provider: 'app'; type: 'fpp' }): unknown;
  __getRuntime(): { metrics: unknown };
  route(template: TemplateStringsArray, ...parameters: unknown[]): unknown;
  default: {
    asApp(): {
      requestJira(route: unknown, init?: unknown): Promise<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
      }>;
    };
  };
}

/** Surcharges utilisées par les tests et par `src/index.ts`. */
export interface EventRuntimeOverrides {
  queue?: BriefQueuePort;
  store?: BriefStorePort;
  markBriefStale?: TriggerDeps['markBriefStale'];
  loadIssueState?: TriggerDeps['loadIssueState'];
  loadSettings?: TriggerDeps['loadSettings'];
  buildBrief?: BriefConsumerDeps['buildBrief'];
  logger?: Logger;
  /** Pousseur de la file platform `brief-build-queue` (déclenche le consumer). */
  platformPush?: PlatformQueuePusher;
}

let storeCache: KeyValueStore | null = null;
let storageApiCache: StorageApi | null = null;

/** Magasin clé/valeur Forge (endpoint `forge/entities/graphql`). */
export function createForgeStore(): KeyValueStore {
  const storagePackage = require('@forge/storage') as StoragePackage;
  const apiPackage = require('@forge/api') as ApiPackage;
  const instance = new storagePackage.GlobalStorage(
    apiPackage.__fetchProduct({ provider: 'app', type: 'fpp' }),
    () => apiPackage.__getRuntime().metrics
  );
  return {
    get: (key) => instance.get(key),
    set: (key, value) => instance.set(key, value),
    delete: (key) => instance.delete(key),
  };
}

function forgeStore(): KeyValueStore {
  if (!storeCache) storeCache = createForgeStore();
  return storeCache;
}

function storageApi(): StorageApi {
  if (!storageApiCache) storageApiCache = require('../storage') as StorageApi;
  return storageApiCache;
}

function briefApi(): BriefApi {
  return require('../brief/builder') as BriefApi;
}

/** Relit l'état du ticket côté Jira (statut, étiquettes, projet). */
export function createForgeIssueStateLoader(): TriggerDeps['loadIssueState'] {
  const apiPackage = require('@forge/api') as ApiPackage;
  const api = apiPackage.default;
  return async (issueKey: string): Promise<IssueState | null> => {
    const path = apiPackage.route`/rest/api/3/issue/${issueKey}?fields=status,labels,project`;
    const response = await api.asApp().requestJira(path);
    if (!response.ok) return null;
    return parseIssueState(issueKey, await response.json());
  };
}

function resolveTriggerDeps(overrides: EventRuntimeOverrides): TriggerDeps {
  const logger = overrides.logger ?? consoleLogger;
  // La file GlobalStorage (journal dédupliqué) est décorée du push platform :
  // c'est lui qui déclenche `brief-builder-consumer` côté Forge. La file du
  // consumer n'est PAS décorée (un re-push différé relancerait la boucle).
  const queue = withPlatformPush(
    overrides.queue ?? createQueue(forgeStore(), logger),
    overrides.platformPush ?? createForgePlatformPusher(),
    logger
  );
  return {
    markBriefStale: overrides.markBriefStale ?? ((issueKey) => storageApi().markBriefStale(issueKey)),
    loadIssueState: overrides.loadIssueState ?? createForgeIssueStateLoader(),
    loadSettings: overrides.loadSettings ?? ((projectKey) => storageApi().loadProjectSettings(projectKey)),
    queue,
    logger,
  };
}

function resolveConsumerDeps(overrides: EventRuntimeOverrides): BriefConsumerDeps {
  const logger = overrides.logger ?? consoleLogger;
  return {
    queue: overrides.queue ?? createQueue(forgeStore(), logger),
    buildBrief: overrides.buildBrief ?? ((issueKey, budget) => briefApi().buildBrief(issueKey, budget)),
    store: overrides.store ?? (storageApi() as BriefStorePort),
    logger,
  };
}

/** Handlers des quatre triggers, dépendances résolues à l'appel. */
export function createEventHandlers(
  overrides: EventRuntimeOverrides = {}
): Record<string, JiraEventHandler> {
  return createJiraEventHandlers(resolveTriggerDeps(overrides));
}

/** Exécution du constructeur en arrière-plan (trigger planifié du manifest). */
export async function runQueueConsumer(
  overrides: EventRuntimeOverrides = {}
): Promise<ConsumeReport> {
  return consumeBriefQueue(resolveConsumerDeps(overrides));
}

/**
 * Point d'entrée du `consumer` Forge (`brief-builder-consumer`).
 *
 * `@forge/events` 2+ remet un `AsyncEvent` : le message poussé par le trigger
 * est dans `event.body`. Tolérant : `event.body.issueKey`, `event.issueKey`,
 * ou aucun événement → balayage complet de la file. Le ticket de l'événement
 * est (ré)inscrit dans la file GlobalStorage avant consommation, ce qui
 * garantit ses trois budgets même si l'entrée locale avait été abandonnée.
 */
export async function runConsumerForEvent(
  event?: unknown,
  overrides: EventRuntimeOverrides = {}
): Promise<ConsumeReport> {
  const deps = resolveConsumerDeps(overrides);
  const logger = overrides.logger ?? consoleLogger;
  const issueKey = extractIssueKeyFromEvent(event);
  if (issueKey) {
    logger.info(`Consumer déclenché pour ${issueKey}`, { issueKey });
    await deps.queue.enqueue({
      issueKey,
      projectKey: extractProjectKeyFromEvent(event),
      reason: extractReasonFromEvent(event) ?? 'issue-updated',
    });
  } else {
    logger.info('Consumer déclenché sans ticket précis : balayage complet de la file');
  }
  return consumeBriefQueue(deps);
}

/** Handlers directement référençables par `manifest.yml`. */
export const defaultEventHandlers: Record<string, JiraEventHandler> = {
  [JIRA_EVENT_KEYS.issueUpdated]: (payload) =>
    createIssueUpdatedHandler(resolveTriggerDeps({}))(payload),
  [JIRA_EVENT_KEYS.issueCommented]: (payload) =>
    createIssueCommentedHandler(resolveTriggerDeps({}))(payload),
  [JIRA_EVENT_KEYS.issueLinkCreated]: (payload) =>
    createIssueLinkCreatedHandler(resolveTriggerDeps({}))(payload),
  [JIRA_EVENT_KEYS.issueLinkDeleted]: (payload) =>
    createIssueLinkDeletedHandler(resolveTriggerDeps({}))(payload),
};
