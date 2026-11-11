/**
 * Cas limites et qualité du ticket (fixtures 10 à 19).
 *
 * 10. PR refusée il y a trois mois alimentant « Déjà tenté ».
 * 11. Tentative abandonnée enregistrée par un agent (en tête de « Déjà tenté », S2).
 * 12. Réouvertures multiples (historique).
 * 13. Compte rendu sans tests (avertissement « non vérifié par des tests », S6).
 * 14. Ticket sans composant ni zone.
 * 15. Auteur compte inactif.
 * 16. Question sans réponse dans les commentaires.
 * 17. Périmètre non borné (trois objectifs dans le résumé, non borné).
 * 18. Critères d'acceptation dans un champ personnalisé.
 * 19. Critères non vérifiables (« améliorer la performance »).
 *
 * Les comptes et les trous sont dérivés des graines par `baseFixture()`.
 */

import {
  attempt,
  baseFixture,
  comment,
  daysAgo,
  decision,
  expected,
  historyEntry,
  monthsAgo,
} from './seeds';
import type { FixtureSpec } from './types';

/* 10. PR refusée il y a trois mois */
const attempts10 = [
  attempt('PR 412 ajoutant une file Redis dédiée aux exports.', {
    at: monthsAgo(3),
    agent: 'cursor',
    kind: 'pr-refusee',
    reason: 'Refusée en revue : aucune nouvelle infrastructure autorisée hors Forge.',
    testsPassed: '4/4',
  }),
];

const FIXTURE_10 = baseFixture({
  key: 'PAY-10',
  scenario: '10 — Pull request refusée il y a trois mois',
  attempts: attempts10,
  expected: expected({
    attemptsFirst: 'PR 412',
    mustAppear: ['PR 412', 'cursor'],
  }),
});

/* 11. Tentative abandonnée (recette S2) */
const attempts11 = [
  attempt('Tentative précédente en streaming naïf sans pagination.', {
    at: monthsAgo(2),
    agent: 'agent-ancien',
    kind: 'reouverture',
    reason: 'Timeout après 25 secondes sur gros volume.',
    testsPassed: '2/5',
  }),
  attempt("Ajout d'une colonne refund_reason dans la table ledger.", {
    at: daysAgo(4),
    agent: 'claude-code',
    kind: 'compte-rendu',
    status: 'abandonné',
    reason: 'Rejeté : le ledger exige des remboursements idempotents sans changement de schéma.',
    testsPassed: '0/3',
  }),
];

const FIXTURE_11 = baseFixture({
  key: 'PAY-11',
  scenario: '11 — Tentative abandonnée enregistrée en tête de Déjà tenté',
  attempts: attempts11,
  expected: expected({
    // Le brief supprime les caractères de mise en forme ('_', '#', '*') des comptes rendus.
    attemptsFirst: "Ajout d'une colonne refund",
    mustAppear: ["Ajout d'une colonne refund", 'Tentative précédente'],
  }),
});

/* 12. Réouvertures multiples */
const attempts12 = [
  attempt('Première livraison clôturée trop vite avant tests d’encodage.', {
    at: monthsAgo(2),
    agent: 'claude-code',
    kind: 'reouverture',
    reason: 'Ticket rouvert deux fois par le QA pour caractères accentués cassés.',
    testsPassed: '3/4',
  }),
];

const FIXTURE_12 = baseFixture({
  key: 'PAY-12',
  scenario: '12 — Réouvertures multiples du ticket',
  attempts: attempts12,
  history: [
    historyEntry(monthsAgo(3), 'luc', 'À faire', 'En cours'),
    historyEntry(monthsAgo(2), 'luc', 'En cours', 'Terminé'),
    historyEntry(monthsAgo(2), 'amina', 'Terminé', 'À faire'),
    historyEntry(monthsAgo(1), 'luc', 'En cours', 'Résolu'),
    historyEntry(daysAgo(7), 'amina', 'Résolu', 'En cours'),
  ],
  expected: expected({
    attemptsFirst: 'Première livraison',
    mustAppear: ['Première livraison'],
  }),
});

/* 13. Compte rendu sans tests (recette S6) : `testsPassed` vide → aucune mention
   « (tests : …) » dans « Déjà tenté » ; l'avertissement produit
   « non vérifié par des tests » est émis par `post-work-report` (vérifié dans
   `fakeJira.test.ts` via la constante réelle du socle). */
const attempts13 = [
  attempt('Correctif écrit sur le formateur CSV, tests non lancés.', {
    at: daysAgo(3),
    agent: 'claude-code',
    kind: 'compte-rendu',
    status: 'partiel',
    reason: 'Exécution des tests remise au passage suivant.',
    criteriaCovered: '1',
    testsPassed: '',
  }),
];

const FIXTURE_13 = baseFixture({
  key: 'PAY-13',
  scenario: '13 — Compte rendu sans tests',
  attempts: attempts13,
  expected: expected({
    attemptsFirst: 'Correctif écrit sur le formateur CSV',
    mustAppear: ['tests non lancés'],
  }),
});

/* 14. Ticket sans composant ni zone : score 90 (à préciser si combiné) */
const FIXTURE_14 = baseFixture({
  key: 'PAY-14',
  scenario: '14 — Ticket sans composant ni zone',
  components: [],
  labels: ['backend'],
  expected: expected({
    gapsExpected: ['Composant identifié'],
  }),
});

/* 15. Auteur compte inactif */
const FIXTURE_15 = baseFixture({
  key: 'PAY-15',
  scenario: '15 — Auteur au compte inactif et sans assigné',
  reporter: 'Jean Dupont (compte désactivé)',
  assignee: undefined,
  expected: expected({
    gapsExpected: ['Auteur joignable'],
  }),
});

/* 16. Question sans réponse dans les commentaires */
const FIXTURE_16 = baseFixture({
  key: 'PAY-16',
  scenario: '16 — Question sans réponse dans les commentaires',
  comments: [
    comment('c1', 'amina', daysAgo(6), 'Le fichier doit-il inclure les montants hors taxes ou TTC ?'),
  ],
  expected: expected({
    gapsExpected: ['Aucune question sans réponse'],
    mustAppear: ['amina'],
  }),
});

/* 17. Périmètre non borné : deux objectifs dans le résumé + description fleuve
   (plus de 600 mots) : le critère « Périmètre borné » échoue. */
const LONG_PARAGRAPH = Array.from(
  { length: 75 },
  (_, index) =>
    `Bloc d'analyse ${index + 1} sur la facturation multi-devises, la reprise des ` +
    'écritures comptables et les rapprochements bancaires du trimestre.'
).join(' ');

const FIXTURE_17 = baseFixture({
  key: 'PAY-17',
  scenario: '17 — Périmètre non borné (deux objectifs, description fleuve)',
  summary: 'Exporter les commandes en CSV et ajouter un filtre de date',
  description: LONG_PARAGRAPH,
  expected: expected({
    gapsExpected: ['Périmètre borné', 'trop de matière'],
    mustAppear: ['Exporter les commandes en CSV'],
  }),
});

/* 18. Critères d'acceptation dans un champ personnalisé dédié.
   Le champ est détecté par son nom (`Definition of Done`) : `collectProjectSettings`
   renvoie son identifiant brut, et `parseIssueSnapshot` en extrait les critères. */
const CUSTOM_CRITERIA = [
  'Le champ personnalisé renvoie 200 avec un en-tête Content-Type text/csv.',
  'Les montants sont arrondis à 2 décimales et testés sur 3 devises.',
];

const FIXTURE_18 = baseFixture({
  key: 'PAY-18',
  scenario: '18 — Critères d’acceptation dans un champ personnalisé',
  acceptanceCriteria: [],
  customFields: [
    {
      id: 'customfield_10042',
      name: 'Definition of Done',
      value: CUSTOM_CRITERIA.map((line) => `- ${line}`).join('\n'),
    },
  ],
  expected: expected({
    mustAppear: ['Content-Type text/csv', 'arrondis à 2 décimales'],
  }),
});

/* 19. Critères non vérifiables (« améliorer la performance ») */
const VAGUE_CRITERIA = [
  'Améliorer la performance de la page.',
  'Rendre le code plus propre.',
];

const FIXTURE_19 = baseFixture({
  key: 'PAY-19',
  scenario: '19 — Critères d’acceptation non vérifiables',
  acceptanceCriteria: VAGUE_CRITERIA,
  decisions: [decision('ADR-040 — Mesure de latence p95')],
  expected: expected({
    gapsExpected: ['Critères d’acceptation vérifiables'],
    mustAppear: ['Améliorer la performance', 'ADR-040'],
  }),
});

export const CAS_LIMITES_FIXTURES: FixtureSpec[] = [
  FIXTURE_10,
  FIXTURE_11,
  FIXTURE_12,
  FIXTURE_13,
  FIXTURE_14,
  FIXTURE_15,
  FIXTURE_16,
  FIXTURE_17,
  FIXTURE_18,
  FIXTURE_19,
];
