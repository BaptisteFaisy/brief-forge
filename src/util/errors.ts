/**
 * Erreurs typées du produit. Chaque erreur porte un code stable, exploitable
 * par les gestionnaires d'actions MCP pour décider s'il faut renvoyer un refus
 * explicite (BC-09) ou un simple avertissement dans le brief.
 */

export type BriefErrorCode =
  | 'PERMISSION_DENIED'
  | 'ISSUE_NOT_FOUND'
  | 'STALE_BRIEF'
  | 'CLAIM_CONFLICT'
  | 'WRITE_FORBIDDEN'
  | 'INTERNAL_ERROR';

export class BriefError extends Error {
  constructor(
    public readonly code: BriefErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BriefError';
  }
}

export class PermissionDeniedError extends BriefError {
  constructor(issueKey: string) {
    super(
      'PERMISSION_DENIED',
      `Accès refusé au ticket ${issueKey} pour l'utilisateur appelant.`,
      { issueKey }
    );
  }
}

export class IssueNotFoundError extends BriefError {
  constructor(issueKey: string) {
    super('ISSUE_NOT_FOUND', `Ticket ${issueKey} introuvable.`, { issueKey });
  }
}

export class StaleBriefError extends BriefError {
  constructor(issueKey: string) {
    super(
      'STALE_BRIEF',
      `Le brief utilisé pour ${issueKey} est périmé : le ticket a été modifié pendant le travail de l'agent.`,
      { issueKey }
    );
  }
}

export class ClaimConflictError extends BriefError {
  constructor(issueKey: string, holderAgent: string, expiresAt: string) {
    super(
      'CLAIM_CONFLICT',
      `Le ticket ${issueKey} est déjà réservé par ${holderAgent} jusqu'au ${expiresAt}.`,
      { issueKey, holderAgent, expiresAt }
    );
  }
}

export class WriteForbiddenError extends BriefError {
  constructor(issueKey: string, reason: string) {
    super(
      'WRITE_FORBIDDEN',
      `Écriture refusée sur ${issueKey} : ${reason}`,
      { issueKey, reason }
    );
  }
}
