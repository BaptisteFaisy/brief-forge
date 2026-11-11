/**
 * `ask-clarification` (CREATE) — poser une question plutôt que deviner.
 *
 * Effet borné : un commentaire qui mentionne l'auteur du ticket, plus
 * l'étiquette `attente-precision`. Rien d'autre ne change dans le ticket.
 * Refus explicite si l'appelant n'a pas le droit de commenter : dans ce cas,
 * **aucune** écriture n'est tentée (droits vérifiés avant la première ligne).
 */

import { requireString, runAction } from './shared';
import { assertIssueAccessFromContext } from '../security/permissionGuard';
import {
  CLARIFICATION_LABEL,
  PERM_COMMENT,
  PERM_EDIT,
  adfDocument,
  addLabel,
  buildCommentUrl,
  maskForWrite,
  mentionParagraph,
  openWriteSession,
  postComment,
  readIssueHeader,
  recordAccess,
  textParagraph,
  type AdfNode,
  type IssueHeader,
} from './writeHelpers';

const TOOL = 'ask-clarification';

/** Corps du commentaire : mention de l'auteur, question, rappel de l'étiquette. */
function buildQuestionAdf(question: string, header: IssueHeader): AdfNode {
  const intro = header.reporterAccountId
    ? mentionParagraph(
        header.reporterAccountId,
        header.reporterName,
        ' — question de clarification posée avant de coder :'
      )
    : textParagraph('Question de clarification posée avant de coder :');
  return adfDocument([
    intro,
    textParagraph(maskForWrite(question)),
    textParagraph(
      `Étiquette « ${CLARIFICATION_LABEL} » posée : le brief de ce ticket attend une réponse.`
    ),
  ]);
}

export async function askClarification(payload: any, context: any): Promise<any> {
  return runAction(TOOL, async () => {
    const issueKey = requireString(payload, 'issueKey');
    const question = requireString(payload, 'question');

    await assertIssueAccessFromContext(issueKey, context);
    const session = await openWriteSession(issueKey, context, [PERM_COMMENT, PERM_EDIT]);
    const header = await readIssueHeader(issueKey, session.port);

    const comment = await postComment(
      issueKey,
      session.port,
      buildQuestionAdf(question, header)
    );
    await addLabel(issueKey, session.port, CLARIFICATION_LABEL);
    await recordAccess(issueKey, TOOL, session.identity.accountId);

    return {
      ok: true,
      issueKey,
      commentUrl: buildCommentUrl(session.identity.cloudId, issueKey, comment),
    };
  });
}
