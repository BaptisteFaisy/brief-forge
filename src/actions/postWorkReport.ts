/**
 * `post-work-report` (CREATE) — ce que l'agent a fait, et ce qu'il n'a pas fait.
 *
 * Effet borné : un commentaire signé, une propriété de ticket
 * (`brief-forge.work-report`) et une ligne `attempt`. Jamais de changement de
 * statut, d'assigné ni de version.
 *
 * Deux exigences produit :
 * - un compte rendu sans tests est **accepté** mais affiché avec
 *   l'avertissement « non vérifié par des tests » ;
 * - chaque compte rendu porte la mention d'attribution
 *   « Rédigé par un agent (<client>) pour le compte de (<utilisateur>) ».
 */

import { hasStaleBrief, saveAttempt } from '../storage';
import { assertIssueAccessFromContext } from '../security/permissionGuard';
import { ReportStatus } from '../types';
import { ActionInputError, optionalString, requireString, runAction } from './shared';
import {
  PERM_COMMENT,
  PERM_EDIT,
  UNTESTED_WARNING,
  WORK_REPORT_PROPERTY,
  adfDocument,
  attributionLine,
  buildCommentUrl,
  callerDisplayName,
  markdownParagraphs,
  maskForWrite,
  newAttemptId,
  openWriteSession,
  postComment,
  recordAccess,
  setIssueProperty,
  textParagraph,
  type AdfNode,
  type PostedComment,
  type WriteSession,
} from './writeHelpers';

const TOOL = 'post-work-report';

const REPORT_STATUSES: readonly ReportStatus[] = ['terminé', 'partiel', 'bloqué', 'abandonné'];

/** Entrées validées du compte rendu. */
interface ReportInput {
  issueKey: string;
  status: ReportStatus;
  report: string;
  criteriaCovered?: string;
  testsPassed?: string;
  warning?: string;
}

/** Statut strictement contrôlé : un statut inventé est refusé, pas deviné. */
function parseStatus(raw: string): ReportStatus {
  const value = raw.trim().toLowerCase();
  const match = REPORT_STATUSES.find((status) => status === value);
  if (!match) {
    throw new ActionInputError(
      `Statut invalide : « ${raw} » (attendu : ${REPORT_STATUSES.join(', ')}).`
    );
  }
  return match;
}

function readReportInput(payload: any): ReportInput {
  const testsPassed = optionalString(payload, 'testsPassed');
  return {
    issueKey: requireString(payload, 'issueKey'),
    status: parseStatus(requireString(payload, 'status')),
    report: requireString(payload, 'report'),
    criteriaCovered: optionalString(payload, 'criteriaCovered'),
    testsPassed,
    warning: testsPassed ? undefined : UNTESTED_WARNING,
  };
}

/** Corps du commentaire : statut, compte rendu, critères, tests, attribution. */
function buildReportAdf(input: ReportInput, attribution: string): AdfNode {
  const nodes: AdfNode[] = [
    textParagraph(`**Statut : ${input.status}**`),
    ...markdownParagraphs(maskForWrite(input.report)),
  ];
  if (input.criteriaCovered) {
    nodes.push(textParagraph(`Critères couverts : ${maskForWrite(input.criteriaCovered)}`));
  }
  nodes.push(
    textParagraph(
      input.testsPassed
        ? `Tests lancés et résultat : ${maskForWrite(input.testsPassed)}`
        : `⚠️ Compte rendu ${UNTESTED_WARNING}`
    )
  );
  nodes.push(textParagraph(attribution));
  return adfDocument(nodes);
}

/** Encart posé sur le ticket : la version courte, relisible par les outils. */
function reportProperty(
  input: ReportInput,
  comment: PostedComment,
  commentUrl: string,
  session: WriteSession,
  at: string
): Record<string, unknown> {
  return {
    issueKey: input.issueKey,
    status: input.status,
    criteriaCovered: input.criteriaCovered ?? '',
    testsPassed: input.testsPassed ?? '',
    warning: input.warning ?? '',
    commentId: comment.id,
    commentUrl,
    agentName: session.identity.clientName ?? 'agent inconnu',
    userAccountId: session.identity.accountId,
    at,
  };
}

/** Enregistre la tentative, publie le commentaire, pose l'encart, journalise. */
async function publishReport(
  input: ReportInput,
  session: WriteSession,
  context: unknown
): Promise<string> {
  const at = new Date().toISOString();
  const attribution = attributionLine(session.identity.clientName, callerDisplayName(context));

  await saveAttempt({
    id: newAttemptId(),
    issueKey: input.issueKey,
    agentName: session.identity.clientName ?? 'agent inconnu',
    userAccountId: session.identity.accountId,
    startedAt: at,
    status: input.status,
    reportMd: maskForWrite(input.report),
    criteriaCovered: input.criteriaCovered ?? '',
    testsPassed: input.testsPassed ?? '',
  });

  const comment = await postComment(
    input.issueKey,
    session.port,
    buildReportAdf(input, attribution)
  );
  const commentUrl = buildCommentUrl(session.identity.cloudId, input.issueKey, comment);
  await setIssueProperty(
    input.issueKey,
    session.port,
    WORK_REPORT_PROPERTY,
    reportProperty(input, comment, commentUrl, session, at)
  );
  await recordAccess(input.issueKey, TOOL, session.identity.accountId, at);
  return commentUrl;
}

export async function postWorkReport(payload: any, context: any): Promise<any> {
  return runAction(TOOL, async () => {
    const input = readReportInput(payload);

    await assertIssueAccessFromContext(input.issueKey, context);
    const session = await openWriteSession(input.issueKey, context, [PERM_COMMENT, PERM_EDIT]);
    const commentUrl = await publishReport(input, session, context);

    // Un brief périmé n'empêche pas d'écrire : la réponse le signale.
    const briefWasStale = await hasStaleBrief(input.issueKey);
    const response: Record<string, unknown> = { ok: true, issueKey: input.issueKey, commentUrl };
    if (input.warning) response.warning = input.warning;
    if (briefWasStale) response.briefWasStale = true;
    return response;
  });
}
