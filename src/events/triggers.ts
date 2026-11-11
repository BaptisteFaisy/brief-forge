/**
 * Triggers Jira (contrat § 4.7).
 *
 * Quatre événements sont écoutés : mise à jour d'un ticket, commentaire, lien
 * créé, lien supprimé. Effet uniforme : **le brief du ticket devient périmé**,
 * puis — et seulement si le ticket est au statut déclencheur ou porte
 * l'étiquette déclencheuse — la clé du ticket entre dans la file de
 * construction (`queue.ts`).
 *
 * Toutes les dépendances sont injectées : ce module ne touche ni à Forge ni au
 * réseau, il est donc entièrement testable avec des doublures.
 */
import {
  BriefQueuePort,
  Logger,
  QueueReason,
  consoleLogger,
  describeError,
} from './queue';

/** Statut déclencheur par défaut : le brief est précalculé quand le ticket est prêt. */
export const TRIGGER_DEFAULT_STATUS = 'Prêt';

/** Étiquette déclencheuse par défaut : elle vaut déclenchement quel que soit le statut. */
export const TRIGGER_DEFAULT_LABEL = 'agent';

/** Clés de modules Forge des quatre triggers, telles qu'elles apparaissent au manifest. */
export const JIRA_EVENT_KEYS = {
  issueUpdated: 'avi:jira:updated:issue',
  issueCommented: 'avi:jira:commented:issue',
  issueLinkCreated: 'avi:jira:created:issuelink',
  issueLinkDeleted: 'avi:jira:deleted:issuelink',
} as const;

export interface IssueState {
  issueKey: string;
  projectKey: string;
  status: string;
  labels: string[];
}

/** Réglages utiles au déclenchement (sous-ensemble de `ProjectSettings`, contrat § 4.1). */
export interface TriggerSettings {
  triggerStatus: string;
  triggerLabel?: string;
}

export const DEFAULT_TRIGGER_SETTINGS: TriggerSettings = {
  triggerStatus: TRIGGER_DEFAULT_STATUS,
  triggerLabel: TRIGGER_DEFAULT_LABEL,
};

export interface TriggerDeps {
  /** Marque tous les briefs stockés du ticket comme périmés (contrat § 4.4). */
  markBriefStale(issueKey: string): Promise<void>;
  /** Relit l'état courant du ticket : le payload d'événement peut être partiel. */
  loadIssueState(issueKey: string): Promise<IssueState | null>;
  loadSettings(projectKey: string): Promise<TriggerSettings | null>;
  queue: BriefQueuePort;
  logger?: Logger;
}

export interface TriggerOutcome {
  issueKey: string;
  markedStale: boolean;
  /** `null` = ticket hors déclencheur, aucun message posté dans la file. */
  queueResult: 'added' | 'already-queued' | null;
  reason: QueueReason;
  error?: string;
}

export type JiraEventHandler = (payload: unknown) => Promise<TriggerOutcome[]>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readKey(value: unknown): string | undefined {
  const key = asRecord(value).key;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (value) seen.add(value);
  }
  return [...seen];
}

/** Comparaison tolérante : casse, espaces et accents ignorés (« Pret » = « Prêt »). */
export function normalizeValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Clés de tickets concernées par un payload Jira. Un événement de lien touche
 * les deux bouts du lien : les deux briefs deviennent périmés.
 */
export function issueKeysFromPayload(payload: unknown): string[] {
  const root = asRecord(payload);
  const link = asRecord(root.issueLink);
  return uniqueStrings([
    readKey(root.issue),
    readKey(link.inwardIssue),
    readKey(link.outwardIssue),
    readKey(root.issueLink),
  ]);
}

/** Extrait l'état minimal d'un ticket depuis une réponse Jira (ou un payload d'événement). */
export function parseIssueState(issueKey: string, payload: unknown): IssueState | null {
  const fields = asRecord(asRecord(payload).fields);
  const status = asRecord(fields.status).name;
  const projectKey = asRecord(fields.project).key;
  if (typeof status !== 'string' || typeof projectKey !== 'string') return null;
  const labels = Array.isArray(fields.labels)
    ? fields.labels.filter((label): label is string => typeof label === 'string')
    : [];
  return { issueKey, projectKey, status, labels };
}

/** Statut déclencheur OU étiquette déclencheuse : l'un suffit. */
export function shouldEnqueue(state: IssueState, settings: TriggerSettings): boolean {
  if (normalizeValue(state.status) === normalizeValue(settings.triggerStatus)) return true;
  if (!settings.triggerLabel) return false;
  const target = normalizeValue(settings.triggerLabel);
  return state.labels.some((label) => normalizeValue(label) === target);
}

async function markStaleSafely(
  issueKey: string,
  deps: TriggerDeps,
  logger: Logger
): Promise<{ ok: boolean; error?: string }> {
  try {
    await deps.markBriefStale(issueKey);
    return { ok: true };
  } catch (error) {
    const message = describeError(error);
    logger.error(`Impossible de marquer le brief de ${issueKey} comme périmé`, { error: message });
    return { ok: false, error: message };
  }
}

async function enqueueIfTriggered(
  issueKey: string,
  reason: QueueReason,
  deps: TriggerDeps,
  logger: Logger
): Promise<'added' | 'already-queued' | null> {
  const state = await deps.loadIssueState(issueKey);
  if (!state) {
    logger.warn(`État illisible pour ${issueKey} : aucune construction demandée`, { issueKey });
    return null;
  }
  const settings = (await deps.loadSettings(state.projectKey)) ?? DEFAULT_TRIGGER_SETTINGS;
  if (!shouldEnqueue(state, settings)) {
    logger.info(`Ticket ${issueKey} hors déclencheur : brief périmé, pas de reconstruction`, {
      status: state.status,
      labels: state.labels,
      triggerStatus: settings.triggerStatus,
    });
    return null;
  }
  return deps.queue.enqueue({ issueKey, projectKey: state.projectKey, reason });
}

async function handleIssueKey(
  issueKey: string,
  reason: QueueReason,
  deps: TriggerDeps,
  logger: Logger
): Promise<TriggerOutcome> {
  const stale = await markStaleSafely(issueKey, deps, logger);
  if (!stale.ok) {
    return { issueKey, markedStale: false, queueResult: null, reason, error: stale.error };
  }
  try {
    const queueResult = await enqueueIfTriggered(issueKey, reason, deps, logger);
    return { issueKey, markedStale: true, queueResult, reason };
  } catch (error) {
    const message = describeError(error);
    logger.error(`Mise en file impossible pour ${issueKey}`, { error: message, reason });
    return { issueKey, markedStale: true, queueResult: null, reason, error: message };
  }
}

async function handleJiraEvent(
  payload: unknown,
  reason: QueueReason,
  deps: TriggerDeps
): Promise<TriggerOutcome[]> {
  const logger = deps.logger ?? consoleLogger;
  const issueKeys = issueKeysFromPayload(payload);
  if (issueKeys.length === 0) {
    logger.warn('Événement Jira sans clé de ticket exploitable : ignoré', { reason });
    return [];
  }
  const outcomes: TriggerOutcome[] = [];
  for (const issueKey of issueKeys) {
    outcomes.push(await handleIssueKey(issueKey, reason, deps, logger));
  }
  return outcomes;
}

function createHandler(reason: QueueReason, deps: TriggerDeps): JiraEventHandler {
  return (payload: unknown) => handleJiraEvent(payload, reason, deps);
}

export function createIssueUpdatedHandler(deps: TriggerDeps): JiraEventHandler {
  return createHandler('issue-updated', deps);
}

export function createIssueCommentedHandler(deps: TriggerDeps): JiraEventHandler {
  return createHandler('comment-added', deps);
}

export function createIssueLinkCreatedHandler(deps: TriggerDeps): JiraEventHandler {
  return createHandler('issue-link-created', deps);
}

export function createIssueLinkDeletedHandler(deps: TriggerDeps): JiraEventHandler {
  return createHandler('issue-link-deleted', deps);
}

/** Table clé de module Forge → handler, prête pour le manifest. */
export function createJiraEventHandlers(deps: TriggerDeps): Record<string, JiraEventHandler> {
  return {
    [JIRA_EVENT_KEYS.issueUpdated]: createIssueUpdatedHandler(deps),
    [JIRA_EVENT_KEYS.issueCommented]: createIssueCommentedHandler(deps),
    [JIRA_EVENT_KEYS.issueLinkCreated]: createIssueLinkCreatedHandler(deps),
    [JIRA_EVENT_KEYS.issueLinkDeleted]: createIssueLinkDeletedHandler(deps),
  };
}
