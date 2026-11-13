/**
 * Point d'entrée Forge — tous les handlers référencés par `manifest.yml`.
 *
 * Trois familles :
 * 1. les onze actions MCP (`rovo:mcp` / `action`), ré-exportées telles quelles ;
 * 2. les résolveurs des écrans Jira (`jira:issueContext`, `jira:projectSettingsPage`,
 *    `jira:projectPage`) et la fonction de propriétés dynamiques de l'encart ;
 * 3. les quatre triggers Jira et le consommateur de la file de construction.
 *
 * Les fonctions de ce fichier restent minces : la logique vit dans `src/actions`,
 * `src/ui`, `src/events`, `src/brief` et `src/readiness`.
 */
import Resolver from '@forge/resolver';

import { getWorkBrief } from './actions/getWorkBrief';
import { checkReadiness, computeAndStore } from './actions/checkReadiness';
import { getAcceptanceCriteria } from './actions/getAcceptanceCriteria';
import { getRelatedDecisions } from './actions/getRelatedDecisions';
import { getFailedAttempts } from './actions/getFailedAttempts';
import { getNeighborChanges } from './actions/getNeighborChanges';
import { listReadyWork } from './actions/listReadyWork';
import { askClarification } from './actions/askClarification';
import { postWorkReport } from './actions/postWorkReport';
import { recordFailedAttempt } from './actions/recordFailedAttempt';
import { claimWork } from './actions/claimWork';

import { loadReadiness, loadAttempts, loadProjectSettings, saveProjectSettings, loadReviews } from './storage';
import { loadBrief } from './storage';
import { computeReadiness } from './readiness';
import { buildBrief } from './brief';
import { collectIssue, collectProjectSettings } from './collect/issueCollector';
import { defaultEventHandlers, runConsumerForEvent, runScheduledDrain } from './events';
import { recordReview } from './review';
import type { RecordReviewResult, ReviewVerdict } from './review';
import { projectMetrics, toUiProjectMetrics } from './metrics';
import type { ReadinessScore } from './types';

// --------------------------------------------------------------------- actions
export {
  getWorkBrief,
  checkReadiness,
  getAcceptanceCriteria,
  getRelatedDecisions,
  getFailedAttempts,
  getNeighborChanges,
  listReadyWork,
  askClarification,
  postWorkReport,
  recordFailedAttempt,
  claimWork,
};

// ------------------------------------------------------------------ résolveurs
const resolver = new Resolver();

function issueKeyFromContext(context: any): string | undefined {
  return context?.extension?.issue?.key;
}

function projectKeyFromContext(context: any): string | undefined {
  return context?.extension?.project?.key;
}

/**
 * Contexte de l'encart Jira : préparation, brief, tentatives.
 *
 * Le score est **calculé à la demande** quand il n'est pas encore stocké.
 * Sans cela, l'encart affiche « Brief indisponible » sur tout ticket dont le
 * score n'a jamais été calculé pour *cette* installation — et Forge SQL est
 * cloisonné par installation : une app installée en Jira et en Confluence a
 * deux bases distinctes, si bien que les outils MCP peuvent router vers une
 * installation différente de celle qui rend l'encart. Un panneau incapable
 * de calculer ce qu'il affiche n'est pas fiable ; celui-ci sait calculer.
 */
resolver.define('getIssueContext', async ({ context }: any) => {
  const issueKey = issueKeyFromContext(context);
  if (!issueKey) return { error: 'Clé de ticket absente du contexte.' };
  const readiness = await readinessOuCalcul(issueKey);
  const brief = await loadBrief(issueKey, 'm');
  const attempts = await loadAttempts(issueKey);
  const reviews = attempts.length > 0 ? await loadReviews(attempts[0].id) : [];
  return {
    issueKey,
    readiness,
    briefMarkdown: brief?.contentMd ?? null,
    briefStale: brief?.stale ?? true,
    attempts,
    lastReview: reviews.length > 0 ? reviews[reviews.length - 1] : null,
  };
});

/**
 * Score stocké, sinon calculé à la demande (et mémorisé).
 * Un calcul raté ne casse pas l'encart : il reste sans score.
 */
async function readinessOuCalcul(issueKey: string): Promise<ReadinessScore | null> {
  const stored = await loadReadiness(issueKey);
  if (stored) return stored;
  try {
    return await computeAndStore(issueKey);
  } catch (error) {
    console.warn(`[resolver:getIssueContext] score indisponible : ${String(error)}`);
    return null;
  }
}

resolver.define('getProjectSettings', async ({ context }: any) => {
  const projectKey = projectKeyFromContext(context);
  if (!projectKey) return { error: 'Clé de projet absente du contexte.' };
  const settings = (await loadProjectSettings(projectKey)) ?? (await collectProjectSettings(projectKey));
  return { projectKey, settings };
});

resolver.define('saveProjectSettings', async ({ payload, context }: any) => {
  const projectKey = projectKeyFromContext(context);
  if (!projectKey) return { error: 'Clé de projet absente du contexte.' };
  await saveProjectSettings({ ...payload, projectKey, projectId: payload?.projectId ?? projectKey });
  return { ok: true };
});

resolver.define('getProjectPage', async ({ context }: any) => {
  const projectKey = projectKeyFromContext(context);
  if (!projectKey) return { error: 'Clé de projet absente du contexte.' };
  const settings = await loadProjectSettings(projectKey);
  const metrics = await projectMetrics(projectKey);
  return {
    projectKey,
    settings,
    metrics: toUiProjectMetrics(metrics),
    // Dénominateurs et drapeaux « données insuffisantes » : l'écran s'en sert
    // pour afficher « — » plutôt qu'un pourcentage inventé.
    metricsDetail: metrics,
  };
});

/** Réponse d'une revue : ce qui a été écrit, et la leçon qui en est issue. */
function reviewPayload(result: RecordReviewResult) {
  return {
    ok: true,
    reviewId: result.review.id,
    lessonCreated: result.lessonCreated,
    lessonId: result.lesson?.id ?? null,
    lessonSkippedReason: result.lessonSkippedReason,
  };
}

/**
 * Revue d'un compte rendu : seul le verdict change entre confirmation et
 * correction, tout le reste est partagé (zéro duplication). `recordReview`
 * enregistre la revue **et** transforme une correction exploitable en leçon
 * réutilisable (BC-14).
 */
async function reviewFromPayload(payload: any, verdict: ReviewVerdict) {
  return recordReview({
    attemptId: String(payload?.attemptId ?? ''),
    issueKey: String(payload?.issueKey ?? ''),
    reviewerName: String(payload?.accountId ?? 'inconnu'),
    verdict,
    note: typeof payload?.note === 'string' ? payload.note : '',
    component: typeof payload?.component === 'string' ? payload.component : undefined,
  });
}

resolver.define('confirmReport', async ({ payload }: any) =>
  reviewPayload(await reviewFromPayload(payload, 'confirmé'))
);

resolver.define('correctReport', async ({ payload }: any) =>
  reviewPayload(await reviewFromPayload(payload, 'corrigé'))
);

resolver.define('refreshReadiness', async ({ context }: any) => {
  const issueKey = issueKeyFromContext(context);
  if (!issueKey) return { error: 'Clé de ticket absente du contexte.' };
  const issue = await collectIssue(issueKey);
  const settings = await collectProjectSettings(issue.projectKey);
  return computeReadiness(issue, settings);
});

resolver.define('refreshBrief', async ({ context }: any) => {
  const issueKey = issueKeyFromContext(context);
  if (!issueKey) return { error: 'Clé de ticket absente du contexte.' };
  const brief = await buildBrief(issueKey, 'm');
  return { issueKey, markdown: brief.markdown };
});

const resolverDefinitions = resolver.getDefinitions();

export const resolveIssueContext = resolverDefinitions;
export const resolveProjectSettings = resolverDefinitions;
export const resolveProjectPage = resolverDefinitions;

/** Propriétés dynamiques de l'encart : badge de préparation dans l'en-tête. */
export async function issueContextDynamicProperties(payload: any): Promise<any> {
  const issueKey = payload?.extension?.issue?.key;
  if (!issueKey) return { status: { type: 'lozenge', value: { label: '—', type: 'default' } } };
  const readiness = await loadReadiness(issueKey);
  if (!readiness) {
    return { status: { type: 'lozenge', value: { label: 'à évaluer', type: 'default' } } };
  }
  const tone = readiness.ready ? 'success' : readiness.score >= 40 ? 'moved' : 'removed';
  return {
    status: {
      type: 'lozenge',
      value: { label: `Préparation ${readiness.score}/100`, type: tone },
    },
  };
}

// ------------------------------------------------------------------- événements
export const onIssueUpdated = (event: any) => defaultEventHandlers['avi:jira:updated:issue'](event);
export const onIssueCommented = (event: any) => defaultEventHandlers['avi:jira:commented:issue'](event);
export const onIssueLinkCreated = (event: any) => defaultEventHandlers['avi:jira:created:issuelink'](event);
export const onIssueLinkDeleted = (event: any) => defaultEventHandlers['avi:jira:deleted:issuelink'](event);

/**
 * Consommateur de la file platform `brief-build-queue` (trois budgets, en
 * arrière-plan). `@forge/events` 2+ remet un `AsyncEvent` : le message poussé
 * par le trigger est dans `event.body`. Tolérant : `event.body.issueKey`,
 * `event.issueKey`, ou aucun événement (balayage complet de la file locale).
 */
export async function onBriefBuildRequested(event?: unknown): Promise<void> {
  await runConsumerForEvent(event);
}

/**
 * Trigger planifié `brief-rebuild-scheduled` : rattrape les briefs encore
 * périmés (message de file perdu, consumer en échec). La logique vit dans
 * `src/events/staleDrain.ts` ; sur un système sain, cela coûte un SELECT par
 * heure et rien d'autre.
 */
export async function briefRebuildScheduled(): Promise<void> {
  await runScheduledDrain();
}
