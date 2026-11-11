/**
 * `record-failed-attempt` (CREATE) — ce qui a été tenté, et pourquoi ça a raté.
 *
 * Effet borné : une ligne `attempt` (statut « abandonné ») + un commentaire
 * court dans le ticket. Le prochain brief commencera sa section « Déjà tenté »
 * par cette tentative. Jamais de changement de statut, d'assigné ni de version.
 */

import { saveAttempt } from '../storage';
import { assertIssueAccessFromContext } from '../security/permissionGuard';
import { requireString, runAction } from './shared';
import {
  PERM_COMMENT,
  attributionLine,
  buildCommentUrl,
  callerDisplayName,
  maskForWrite,
  newAttemptId,
  openWriteSession,
  postComment,
  recordAccess,
  adfDocument,
  textParagraph,
  type AdfNode,
} from './writeHelpers';

const TOOL = 'record-failed-attempt';

interface AttemptText {
  summary: string;
  reason: string;
  attribution: string;
}

/** Corps du commentaire : deux lignes utiles, rien de plus. */
function buildAttemptAdf(input: AttemptText): AdfNode {
  return adfDocument([
    textParagraph(`Tentative abandonnée : ${maskForWrite(input.summary)}`),
    textParagraph(`Raison : ${maskForWrite(input.reason)}`),
    textParagraph(input.attribution),
  ]);
}

/** Texte conservé en base, identique à ce que lit un humain dans le ticket. */
function attemptMarkdown(input: AttemptText): string {
  return [
    '## Statut : abandonné',
    `Tentative abandonnée : ${maskForWrite(input.summary)}`,
    `Raison : ${maskForWrite(input.reason)}`,
    input.attribution,
  ].join('\n');
}

export async function recordFailedAttempt(payload: any, context: any): Promise<any> {
  return runAction(TOOL, async () => {
    const issueKey = requireString(payload, 'issueKey');
    const summary = requireString(payload, 'summary');
    const reason = requireString(payload, 'reason');

    await assertIssueAccessFromContext(issueKey, context);
    const session = await openWriteSession(issueKey, context, [PERM_COMMENT]);

    const text: AttemptText = {
      summary,
      reason,
      attribution: attributionLine(
        session.identity.clientName,
        callerDisplayName(context)
      ),
    };
    const attemptId = newAttemptId();

    await saveAttempt({
      id: attemptId,
      issueKey,
      agentName: session.identity.clientName ?? 'agent inconnu',
      userAccountId: session.identity.accountId,
      startedAt: new Date().toISOString(),
      status: 'abandonné',
      reportMd: attemptMarkdown(text),
      criteriaCovered: '',
      testsPassed: '',
    });

    const comment = await postComment(issueKey, session.port, buildAttemptAdf(text));
    await recordAccess(issueKey, TOOL, session.identity.accountId);

    return {
      ok: true,
      issueKey,
      attemptId,
      commentUrl: buildCommentUrl(session.identity.cloudId, issueKey, comment),
    };
  });
}
