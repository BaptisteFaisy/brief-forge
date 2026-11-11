/**
 * Sources extérieures : Confluence, épopée et repli sur panne (fixtures 20 à 24).
 *
 * 20. Épopée parente avec décisions héritées.
 * 21. Page Confluence étiquetée `decision` liée au ticket (S1).
 * 22. Page Confluence étiquetée `adr` liée à l'épopée.
 * 23. Confluence indisponible (repli : décisions en commentaires seulement).
 * 24. Graphe indisponible (repli : information de développement Jira).
 *
 * Les comptes et les trous sont dérivés des graines par `baseFixture()`.
 */

import { baseFixture, daysAgo, decision, expected, monthsAgo, neighbor } from './seeds';
import type { FixtureSpec } from './types';

/* 20. Épopée parente avec décisions héritées */
const epicDecisions = [
  decision('ADR-050 — Politique de chiffrement des exports épopée', {
    date: monthsAgo(2),
    author: 'dana',
    mentions: ['PAY-200', 'PAY-20'],
    body: "Toute sortie d'export dans l'épopée PAY-200 passe par le flux chiffré.",
  }),
];

const FIXTURE_20 = baseFixture({
  key: 'PAY-20',
  scenario: '20 — Épopée parente avec décisions héritées',
  epicKey: 'PAY-200',
  decisions: epicDecisions,
  expected: expected({
    mustAppear: ['ADR-050'],
  }),
});

/* 21. Page Confluence étiquetée `decision` liée au ticket (recette S1) */
const taggedDecision = [
  decision('Décision — Remboursements idempotents via clé client', {
    date: daysAgo(15),
    author: 'eli',
    labels: ['decision'],
    mentions: ['PAY-21'],
    body: 'Le ledger exige des remboursements idempotents avec clé de déduplication.',
  }),
];

const FIXTURE_21 = baseFixture({
  key: 'PAY-21',
  scenario: '21 — Page Confluence étiquetée decision liée au ticket',
  decisionLabels: ['decision'],
  decisions: taggedDecision,
  expected: expected({
    mustAppear: ['Remboursements idempotents', 'https://exemple.atlassian.net'],
  }),
});

/* 22. Page Confluence étiquetée `adr` liée à l'épopée */
const adrEpicDecision = [
  decision('ADR-055 — Journal d’audit immuable sur l’épopée', {
    date: monthsAgo(1),
    author: 'nora',
    labels: ['adr'],
    mentions: ['PAY-220', 'PAY-22'],
    body: "Chaque écriture comptable de l'épopée PAY-220 écrit une entrée immuable.",
  }),
];

const FIXTURE_22 = baseFixture({
  key: 'PAY-22',
  scenario: '22 — Page Confluence étiquetée adr liée à l’épopée',
  epicKey: 'PAY-220',
  decisionLabels: ['adr'],
  decisions: adrEpicDecision,
  expected: expected({
    mustAppear: ['ADR-055'],
  }),
});

/* 23. Confluence indisponible (repli : décisions en commentaires seulement) */
const mixedDecisions = [
  decision('ADR-060 — Page Confluence injoignable', {
    via: 'confluence',
    date: monthsAgo(1),
    author: 'dana',
  }),
  decision('Décision en commentaire : limiter la taille du lot à 250', {
    via: 'comment',
    date: daysAgo(4),
    author: 'luc',
    body: 'On a décidé de limiter la taille du lot à 250 lignes.',
  }),
];

const FIXTURE_23 = baseFixture({
  key: 'PAY-23',
  scenario: '23 — Confluence indisponible, repli sur commentaires',
  outages: ['confluence'],
  decisions: mixedDecisions,
  expected: expected({
    mustAppear: ['luc'],
    mustNotAppear: ['ADR-060'],
  }),
});

/* 24. Graphe indisponible (repli : information de développement Jira) */
const devNeighbors = [
  neighbor('PR-104 — Correctif encodage CSV sur dev-status', {
    kind: 'pull-request',
    date: daysAgo(3),
    author: 'luc',
    state: 'MERGED',
  }),
  neighbor('PR-105 — Échappement des guillemets CSV', {
    kind: 'pull-request',
    date: daysAgo(4),
    author: 'samir',
    state: 'OPEN',
  }),
];

const FIXTURE_24 = baseFixture({
  key: 'PAY-24',
  scenario: '24 — Teamwork Graph indisponible, repli dev-status Jira',
  outages: ['graph'],
  neighbors: devNeighbors,
  expected: expected({
    mustAppear: ['PR-104', 'PR-105'],
  }),
});

export const SOURCES_EXTERIEURES_FIXTURES: FixtureSpec[] = [
  FIXTURE_20,
  FIXTURE_21,
  FIXTURE_22,
  FIXTURE_23,
  FIXTURE_24,
];
