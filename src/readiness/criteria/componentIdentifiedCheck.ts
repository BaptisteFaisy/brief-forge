/**
 * Critère « composant ou zone identifié » — 10 points.
 *
 * Sans composant, l'agent ne sait pas où chercher le code : il explore au
 * hasard et consomme son budget en reconnaissance. On accepte quatre preuves,
 * de la plus fiable à la plus souple : le champ `components` de Jira, la zone
 * configurée sur le projet, une étiquette de la forme `component: paiement`,
 * ou un champ personnalisé qui nomme le module.
 */

import { buildOutcome, normalizeText } from '../support';
import type { CriterionInput, CriterionOutcome } from '../types';

const LABEL_HINT = /^(comp|composant|component|zone|area|module|service)[:\-_]/;
const FIELD_HINT = /(composant|component|zone|area|module)/;

/** Champ personnalisé qui nomme une zone de code, s'il existe. */
function zoneFromCustomField(customFields: Record<string, string>): string | null {
  const entry = Object.entries(customFields ?? {}).find(
    ([key, value]) => FIELD_HINT.test(normalizeText(key)) && (value ?? '').trim().length > 0
  );
  return entry ? entry[0] : null;
}

export function checkComponentIdentified(input: CriterionInput): CriterionOutcome {
  const { issue, settings } = input;

  const components = (issue.components ?? []).filter((component) => (component ?? '').trim().length > 0);
  if (components.length > 0) {
    return buildOutcome('componentIdentified', true);
  }

  if ((settings.componentZone ?? '').trim().length > 0) {
    return buildOutcome('componentIdentified', true);
  }

  const labeled = (issue.labels ?? []).some((label) => LABEL_HINT.test(normalizeText(label).trim()));
  if (labeled) {
    return buildOutcome('componentIdentified', true);
  }

  if (zoneFromCustomField(issue.customFields ?? {})) {
    return buildOutcome('componentIdentified', true);
  }

  return buildOutcome(
    'componentIdentified',
    false,
    'aucun composant ni zone identifié : l’agent ne sait pas où chercher le code et partira en exploration.'
  );
}
