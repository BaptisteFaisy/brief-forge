/**
 * Critère « auteur ou responsable joignable » — 10 points.
 *
 * Un brief sans destinataire de question est un cul-de-sac : quand l'agent
 * hésite, il doit pouvoir demander. On exige donc au moins un compte
 * plausible — rapporteur ou assigné — c'est-à-dire non vide, non générique
 * (« inconnu », « n/a ») et non marqué comme supprimé ou désactivé.
 *
 * Aucun appel réseau n'est fait ici : le statut du compte se lit dans la
 * chaîne fournie par la collecte, ce qui garde le critère pur et testable.
 */

import { buildOutcome, normalizeText } from '../support';
import type { CriterionInput, CriterionOutcome } from '../types';

const PLACEHOLDER = /^(inconnu|unknown|n\/?a|na|none|null|-+|anonyme|anonymous|accountid:?unknown)$/;
const INACTIVE_HINT = /(supprim|deleted|desactiv|deactivated|inactif|compte ferme|ancien collaborateur|former employee)/;

function isPlausibleAccount(person: string): boolean {
  const cleaned = normalizeText(person).trim();
  if (!cleaned || cleaned.length < 2) return false;
  if (PLACEHOLDER.test(cleaned)) return false;
  return !INACTIVE_HINT.test(cleaned);
}

export function checkReachableAuthor(input: CriterionInput): CriterionOutcome {
  const { issue } = input;
  const candidates = [issue.reporter, issue.assignee]
    .map((person) => (person ?? '').trim())
    .filter((person) => person.length > 0);

  if (candidates.length === 0) {
    return buildOutcome(
      'reachableAuthor',
      false,
      'aucun rapporteur ni assigné : personne à qui poser une question, l’agent travaillera à l’aveugle.'
    );
  }

  const plausible = candidates.filter(isPlausibleAccount);
  if (plausible.length > 0) {
    return buildOutcome('reachableAuthor', true);
  }

  return buildOutcome(
    'reachableAuthor',
    false,
    `auteur(s) injoignable(s) : ${candidates.join(', ')} (compte générique, supprimé ou désactivé).`
  );
}
