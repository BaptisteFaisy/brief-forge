/**
 * `claim-work` (UPDATE) — réserver le ticket à un agent pendant 4 h.
 *
 * Le verrou est **coopératif** : il évite deux agents sur le même ticket, il
 * n'authentifie personne (`SECURITY.md` § 4.4). Une réservation expirée ne
 * bloque plus rien (`loadActiveClaim` l'ignore).
 *
 * Aucune écriture Jira : ni assigné, ni statut, ni sprint.
 */

import { CLAIM_EXPIRY_HOURS } from '../config';
import { defaultClaimExpiry, loadActiveClaim, saveClaim } from '../storage';
import { assertIssueAccessFromContext } from '../security/permissionGuard';
import { ClaimConflictError } from '../util/errors';
import { requireString, runAction } from './shared';
import { recordAccess, requireWriteIdentity } from './writeHelpers';

const TOOL = 'claim-work';

export async function claimWork(payload: any, context: any): Promise<any> {
  return runAction(TOOL, async () => {
    const issueKey = requireString(payload, 'issueKey');
    const agentName = requireString(payload, 'agentName');

    // Règle du produit : le contrôle d'accès passe en premier.
    await assertIssueAccessFromContext(issueKey, context);
    const identity = requireWriteIdentity(issueKey, context);

    const existing = await loadActiveClaim(issueKey);
    if (existing && existing.agentName !== agentName) {
      throw new ClaimConflictError(issueKey, existing.agentName, existing.expiresAt);
    }

    const expiresAt = defaultClaimExpiry();
    await saveClaim({
      issueKey,
      agentName,
      userAccountId: identity.accountId,
      expiresAt,
    });
    await recordAccess(issueKey, TOOL, identity.accountId);

    return { ok: true, issueKey, agentName, expiresAt, expiresInHours: CLAIM_EXPIRY_HOURS };
  });
}
