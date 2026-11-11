/**
 * Lot nominal et cas simples (fixtures 1 à 5).
 *
 * 1. Ticket nominal complet (critères, décisions, tentatives, voisins, composant).
 * 2. Sans description (score < 40, section « Trous » longue).
 * 3. 300 commentaires (seuls décisions, réponses et les 10 derniers candidats).
 * 4. Décisions contradictoires (les deux citées, la plus récente d'abord).
 * 5. Décision de plus de 18 mois (marquée « ancienne, à confirmer »).
 *
 * Les comptes attendus (critères, décisions, voisins) et les trous attendus
 * sont **dérivés des graines** par `baseFixture()` : seules les intentions
 * propres à chaque cas sont déclarées ici.
 */

import {
  ANCIENT_DATE,
  attempt,
  baseFixture,
  chatter,
  comment,
  daysAgo,
  decision,
  expected,
  lesson,
  link,
  monthsAgo,
  neighbor,
} from './seeds';
import type { FixtureSpec } from './types';

/* 1. Ticket nominal complet */
const decisionsNominal = [
  decision('ADR-010 — Export CSV généré côté serveur', {
    date: monthsAgo(2),
    author: 'dana',
    body: 'On a choisi de générer le CSV côté serveur en flux continu pour éviter de charger la mémoire du navigateur.',
  }),
  decision('ADR-014 — Séparateur point-virgule pour Excel FR', {
    date: monthsAgo(1),
    author: 'eli',
    body: 'Le séparateur par défaut reste le point-virgule afin que les postes francophones ouvrent le CSV sans décalage.',
  }),
];
const attemptsNominal = [
  attempt('Prototype côté client avec Blob JS.', {
    at: monthsAgo(1),
    kind: 'pr-refusee',
    reason: 'Mémoire navigateur saturée au-delà de 5 000 lignes.',
    testsPassed: '8/10',
  }),
];
const neighborsNominal = [
  neighbor('PR-88 — Pagination curseur sur /api/commandes', { date: daysAgo(5), author: 'luc' }),
];

const FIXTURE_01 = baseFixture({
  key: 'CMD-1',
  scenario: '01 — Ticket nominal complet',
  constraints: 'Aucune nouvelle dépendance NPM ; encodage UTF-8 avec BOM.',
  decisions: decisionsNominal,
  attempts: attemptsNominal,
  neighbors: neighborsNominal,
  lessons: [lesson('Toujours tester l’ouverture du CSV sous tableur avant de clore.')],
  links: [link('CMD-0', { status: 'Terminé', title: 'Pagination /api/commandes' })],
  comments: [comment('c1', 'amina', daysAgo(3), 'Maquette validée avec le support client.')],
  expected: expected({
    readinessBucket: 'prêt',
    attemptsFirst: 'Prototype côté client',
    mustAppear: [
      'ADR-010',
      'ADR-014',
      'Prototype côté client',
      'PR-88',
      'Aucune nouvelle dépendance NPM',
    ],
  }),
});

/* 2. Sans description : score < 40, section « Trous » longue */
const FIXTURE_02 = baseFixture({
  key: 'CMD-2',
  scenario: '02 — Ticket sans description',
  summary: 'Corriger le calcul de TVA',
  description: '',
  acceptanceCriteria: [],
  components: [],
  assignee: undefined,
  expected: expected({
    readinessBucket: 'non prêt',
    gapsExpected: [
      'Objectif écrit',
      'Critères d’acceptation',
      'Périmètre borné',
      'Composant identifié',
    ],
    mustAppear: ['aucune description fournie'],
  }),
});

/* 3. 300 commentaires (générés, dont décisions + question + réponse) */
const earlyDecisions = [
  comment('c-dec-1', 'dana', daysAgo(320), '[décision] Limiter les lots à 500 lignes par requête.'),
  comment('c-dec-2', 'eli', daysAgo(290), 'Décision : conserver le format ISO-8601 pour les dates.'),
];
const earlyQuestionThread = [
  comment('c-q-1', 'samir', daysAgo(250), 'Faut-il inclure les commandes annulées dans le CSV ?'),
  comment('c-rep-1', 'amina', daysAgo(249), 'Non, on exclut les commandes annulées par défaut.'),
];
const threeHundredComments = [
  ...chatter(150, 1, 400),
  ...earlyDecisions,
  ...earlyQuestionThread,
  ...chatter(146, 151, 200),
];
const decisions03 = [decision('ADR-019 — Flux CSV paginé', { date: monthsAgo(1), author: 'dana' })];

const FIXTURE_03 = baseFixture({
  key: 'CMD-3',
  scenario: '03 — Ticket à 300 commentaires',
  commentPageSize: 100,
  comments: threeHundredComments,
  decisions: decisions03,
  expected: expected({ mustAppear: ['ADR-019'] }),
});

/* 4. Décisions contradictoires */
const contradictory = [
  decision('ADR-021 — Cache mémoire obligatoire pour /api/commandes', {
    date: monthsAgo(3),
    author: 'luc',
    body: 'Toujours utiliser le cache mémoire local pour les lectures de commandes afin de réduire la latence.',
  }),
  decision('ADR-025 — Cache mémoire interdit sur le service commandes', {
    date: daysAgo(12),
    author: 'dana',
    body: 'Ne jamais utiliser de cache mémoire local pour les lectures de commandes : les données doivent rester fraîches.',
  }),
];

const FIXTURE_04 = baseFixture({
  key: 'CMD-4',
  scenario: '04 — Décisions contradictoires',
  decisions: contradictory,
  contradictions: [contradictory[0].title, contradictory[1].title],
  expected: expected({
    gapsExpected: ['Aucune décision contradictoire'],
    mustAppear: ['ADR-021', 'ADR-025'],
  }),
});

/* 5. Décision de plus de 18 mois */
const staleDecisions = [
  decision('ADR-002 — Format d’export hérité de 2024', {
    date: ANCIENT_DATE,
    author: 'nora',
    body: "À l'époque, l'export utilisait un encodage ISO-8859-1 pour l'outil comptable.",
  }),
];

const FIXTURE_05 = baseFixture({
  key: 'CMD-5',
  scenario: '05 — Décision de plus de 18 mois',
  decisions: staleDecisions,
  expected: expected({ mustAppear: ['ADR-002', 'ancienne, à confirmer'] }),
});

export const NOMINAL_FIXTURES: FixtureSpec[] = [
  FIXTURE_01,
  FIXTURE_02,
  FIXTURE_03,
  FIXTURE_04,
  FIXTURE_05,
];
