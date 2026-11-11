/**
 * Critère « aucun lien bloquant ouvert » — 15 points.
 *
 * Un agent qui démarre sur un ticket bloqué travaille pour rien : la
 * dépendance n'est pas livrée, le code qu'il doit modifier n'existe pas encore.
 * On refuse donc le ticket tant qu'un lien de type bloquant n'est pas dans un
 * statut terminal. Un statut inconnu est traité comme **ouvert** : dans le
 * doute, on ne fait pas travailler un agent sur une dépendance non vérifiée.
 */

import { buildOutcome, normalizeText } from '../support';
import type { CriterionInput, CriterionOutcome, IssueLink } from '../types';

const BLOCKING_TYPES = /(block|bloqu|depend|impediment|entrave|waiting|bloque)/;
const CLOSED_STATUSES = /^(termine|terminee|closed|done|resolu|resolue|resolved|ferme|fermee|annule|annulee|cancelled|canceled|rejete|rejetee|abandonne)$/;
const MAX_LINKS_SHOWN = 3;

function isClosedStatus(status?: string): boolean {
  if (!status) return false;
  return CLOSED_STATUSES.test(normalizeText(status).replace(/[^a-z]/g, '').trim());
}

function isOpenBlocker(link: IssueLink): boolean {
  if (!BLOCKING_TYPES.test(normalizeText(link.type))) return false;
  return !isClosedStatus(link.status);
}

function describeLink(link: IssueLink): string {
  const status = link.status ? `statut : ${link.status}` : 'statut inconnu';
  return `${link.key} (« ${link.type} », ${status})`;
}

export function checkBlockingLink(input: CriterionInput): CriterionOutcome {
  const blockers = (input.issue.links ?? []).filter(isOpenBlocker);

  if (blockers.length === 0) {
    return buildOutcome('noBlockingLink', true);
  }

  const shown = blockers.slice(0, MAX_LINKS_SHOWN).map(describeLink).join(', ');
  const more = blockers.length > MAX_LINKS_SHOWN ? ` et ${blockers.length - MAX_LINKS_SHOWN} autre(s)` : '';
  return buildOutcome(
    'noBlockingLink',
    false,
    `${blockers.length} lien(s) bloquant(s) non résolu(s) : ${shown}${more}.`
  );
}
