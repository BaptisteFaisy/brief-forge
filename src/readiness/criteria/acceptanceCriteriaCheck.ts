/**
 * Critère « critères d'acceptation » — 30 points.
 *
 * Un ticket est prêt si au moins deux critères d'acceptation **vérifiables**
 * existent : un critère vérifiable décrit un résultat observable (« le bouton
 * Export renvoie un CSV »), pas une intention (« améliorer l'export »).
 *
 * Sources examinées, dans l'ordre : le champ dédié du ticket
 * (`acceptanceCriteria`), le champ personnalisé configuré sur le projet, une
 * section « Critères d'acceptation » de la description, puis les cases à
 * cocher de la description.
 */

import {
  buildOutcome,
  countWords,
  extractSection,
  hasVerifiableSignal,
  quoteExcerpt,
  splitItems,
} from '../support';
import type { CriterionInput, CriterionOutcome } from '../types';

const SECTION_TITLES = [
  'critere dacceptation',
  'criteres dacceptation',
  'acceptance criteria',
  'acceptance criterias',
  'definition of done',
  'definition de fini',
  'ca',
];

const MIN_VERIFIABLE = 2;

/** Rassemble tous les critères candidats, sans doublon. */
function collectCandidates(input: CriterionInput): string[] {
  const { issue, settings } = input;
  const fromField = issue.acceptanceCriteria ?? [];
  const customFieldKey = settings.acceptanceCriteriaField;
  const fromCustom = customFieldKey ? splitItems(issue.customFields?.[customFieldKey] ?? '') : [];
  const fromSection = splitItems(extractSection(issue.description ?? '', SECTION_TITLES).join('\n'));
  const fromCheckboxes = splitItems(
    (issue.description ?? '')
      .split(/\r?\n/)
      .filter((line) => /\[[ x]\]/i.test(line))
      .join('\n')
  );
  const merged = [...fromField, ...fromCustom, ...fromSection, ...fromCheckboxes]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return Array.from(new Set(merged));
}

export function checkAcceptanceCriteria(input: CriterionInput): CriterionOutcome {
  const candidates = collectCandidates(input);

  if (candidates.length === 0) {
    return buildOutcome(
      'acceptanceCriteria',
      false,
      'aucun critère d’acceptation : rien ne dit quand le travail est terminé.'
    );
  }

  const verifiable = candidates.filter(hasVerifiableSignal);

  if (verifiable.length >= MIN_VERIFIABLE) {
    return buildOutcome('acceptanceCriteria', true);
  }

  if (verifiable.length === 0) {
    const longest = [...candidates].sort((a, b) => countWords(b) - countWords(a))[0];
    return buildOutcome(
      'acceptanceCriteria',
      false,
      `${candidates.length} critère(s) présent(s) mais aucun n’est vérifiable (ex. « ${quoteExcerpt(
        longest
      )} ») : formuler un résultat observable, pas une intention.`
    );
  }

  return buildOutcome(
    'acceptanceCriteria',
    false,
    `un seul critère vérifiable sur ${candidates.length} : il en faut au moins ${MIN_VERIFIABLE} pour couvrir le travail.`
  );
}
