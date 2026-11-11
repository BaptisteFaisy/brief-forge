/**
 * Voisinage, troncature sous budget et contraintes (fixtures 25 à 28).
 *
 * 25. Voisins nombreux (troncature → l'outil `get-neighbor-changes` est nommé, S5).
 * 26. Décisions nombreuses (troncature → `get-related-decisions` nommé).
 * 27. Leçons issues de comptes rendus corrigés sur le même composant.
 * 28. Contraintes projet (« pas de nouvelle dépendance dans ce module »).
 *
 * Les comptes et les trous sont dérivés des graines par `baseFixture()`.
 * La troncature elle-même dépend du budget : elle est vérifiée par
 * `fakeJira.test.ts` au budget `s`, pas dans `mustAppear`.
 */

import {
  attempt,
  baseFixture,
  decision,
  decisionBatch,
  expected,
  lesson,
  monthsAgo,
  neighbor,
  neighborBatch,
} from './seeds';
import type { FixtureSpec } from './types';

/* 25. Voisins nombreux (le budget s tronque la section et nomme l'outil) */
const manyNeighbors = neighborBatch(14, 'PR-Voisin');
const decisions25 = [decision('ADR-070 — Export paginé par curseur')];

const FIXTURE_25 = baseFixture({
  key: 'PAY-25',
  scenario: '25 — Voisins nombreux (troncature sous budget s)',
  decisions: decisions25,
  neighbors: manyNeighbors,
  attempts: [attempt('Première passe sans curseur.', { testsPassed: '5/6' })],
  expected: expected({ mustAppear: ['PR-Voisin 1'] }),
});

/* 26. Décisions nombreuses (troncature → `get-related-decisions`) */
const manyDecisions = decisionBatch(20);

const FIXTURE_26 = baseFixture({
  key: 'PAY-26',
  scenario: '26 — Décisions nombreuses (troncature get-related-decisions)',
  decisions: manyDecisions,
  neighbors: [neighbor('PR-120 — Tracé des écritures')],
  attempts: [attempt('Essai précédent avec tampon mémoire.', { testsPassed: '3/4' })],
  expected: expected({ mustAppear: ['ADR-80'] }),
});

/* 27. Leçons issues de comptes rendus corrigés sur le même composant */
const lessons27 = [
  lesson('Toujours normaliser les montants en centimes entiers avant arrondi CSV.', {
    component: 'commandes',
    sourceAttemptId: 'att-hist-1',
  }),
  lesson('Échapper les cellules commençant par =, + ou - pour bloquer l’injection tableur.', {
    component: 'commandes',
    sourceAttemptId: 'att-hist-2',
  }),
];

const FIXTURE_27 = baseFixture({
  key: 'PAY-27',
  scenario: '27 — Leçons issues de comptes rendus corrigés sur le composant',
  decisions: [decision('ADR-091 — Protection contre les formules CSV')],
  lessons: lessons27,
  expected: expected({ mustAppear: ['centimes entiers', 'cellules commençant par'] }),
});

/* 28. Contraintes projet */
const FIXTURE_28 = baseFixture({
  key: 'PAY-28',
  scenario: '28 — Contraintes projet déclarées',
  constraints: 'Pas de nouvelle dépendance dans ce module ; zéro appel réseau hors Atlassian.',
  settings: { componentZone: 'src/exports' },
  decisions: [decision('ADR-092 — Bibliothèque standard uniquement', { date: monthsAgo(1) })],
  expected: expected({
    mustAppear: ['Pas de nouvelle dépendance dans ce module', 'src/exports'],
  }),
});

export const VOISINAGE_FIXTURES: FixtureSpec[] = [
  FIXTURE_25,
  FIXTURE_26,
  FIXTURE_27,
  FIXTURE_28,
];
