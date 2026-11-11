/**
 * Fixtures partagées des tests du moteur de brief.
 *
 * Aucune dépendance réseau : les dépendances du brief sont remplacées par des
 * doublures qui renvoient ces objets (contrat § 2.4).
 */

import type { IssueSnapshot, NeighborChange, DecisionRecord, ProjectSettings } from '../../src/collect/types';
import type { AttemptRecord, LessonRecord } from '../../src/storage/types';
import type { BriefDeps } from '../../src/brief/builder';

export const OLD_DATE = '2020-03-12T09:00:00.000Z';
export const RECENT_DATE = '2026-10-01T08:30:00.000Z';

export function makeIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    issueKey: 'TST-101',
    projectKey: 'TST',
    summary: 'Ajouter un filtre de date sur la liste des commandes',
    description:
      'La liste des commandes doit pouvoir être filtrée par date de création.\n' +
      'Le filtre est appliqué côté serveur et renvoyé dans la réponse paginée.',
    status: 'En cours',
    issueType: 'Story',
    components: ['commandes'],
    labels: ['backend', 'urgent'],
    reporter: 'amina',
    assignee: 'luc',
    createdAt: OLD_DATE,
    updatedAt: RECENT_DATE,
    acceptanceCriteria: [
      'Le filtre accepte deux bornes de date incluses.',
      'La liste renvoie 20 commandes maximum par page.',
    ],
    links: [],
    comments: [
      { id: 'c1', author: 'luc', createdAt: RECENT_DATE, body: 'Je prends le ticket.' },
      { id: 'c2', author: 'amina', createdAt: OLD_DATE, body: 'Priorité haute pour la démo.' },
    ],
    history: [],
    customFields: {},
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    projectId: 'p-1',
    projectKey: 'TST',
    triggerStatus: 'À faire',
    decisionLabels: ['décision'],
    constraintsText: 'Pas de migration destructive ; rétrocompatibilité API obligatoire.',
    componentZone: 'src/orders',
    ...overrides,
  };
}

export function makeDecision(index: number, overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    title: `Décision ${index} sur le filtrage`,
    url: `https://exemple.atlassian.net/wiki/pages/${index}`,
    date: RECENT_DATE,
    author: 'amina',
    body:
      `Le filtrage se fait côté serveur pour éviter de charger toute la table. ` +
      `Motif historique ${index} : la version client dépassait la mémoire sur les gros comptes.`,
    ...overrides,
  };
}

export function makeDecisions(count: number): DecisionRecord[] {
  return Array.from({ length: count }, (_, index) => makeDecision(index + 1));
}

export function makeNeighbor(index: number, overrides: Partial<NeighborChange> = {}): NeighborChange {
  return {
    kind: index % 2 === 0 ? 'pull-request' : 'commit',
    title: `Changement voisin ${index} sur la pagination`,
    url: `https://exemple.atlassian.net/dev/changes/${index}`,
    date: RECENT_DATE,
    author: 'luc',
    state: 'merged',
    ...overrides,
  };
}

export function makeNeighbors(count: number): NeighborChange[] {
  return Array.from({ length: count }, (_, index) => makeNeighbor(index + 1));
}

export function makeAttempts(): AttemptRecord[] {
  return [
    {
      id: 'a-old',
      issueKey: 'TST-101',
      agentName: 'agent-ancien',
      userAccountId: 'acc-1',
      startedAt: OLD_DATE,
      status: 'abandonné',
      reportMd: "Filtre SQL écrit, mais la migration de schéma a échoué en préprod.",
      criteriaCovered: '1',
      testsPassed: '0/2',
    },
    {
      id: 'a-new',
      issueKey: 'TST-101',
      agentName: 'agent-recent',
      userAccountId: 'acc-2',
      startedAt: '2026-10-20T11:00:00.000Z',
      status: 'bloqué',
      reportMd: 'Blocage sur la conversion de fuseau horaire des bornes de date.',
      criteriaCovered: '',
      testsPassed: '1/2',
    },
    {
      id: 'a-done',
      issueKey: 'TST-101',
      agentName: 'agent-fini',
      userAccountId: 'acc-3',
      startedAt: '2026-09-01T10:00:00.000Z',
      status: 'terminé',
      reportMd: 'Travail livré puis reverté par le produit.',
      criteriaCovered: '1, 2',
      testsPassed: '2/2',
    },
  ];
}

export function makeLessons(): LessonRecord[] {
  return [
    {
      id: 'l-1',
      projectKey: 'TST',
      component: 'commandes',
      text: 'Toujours réutiliser le helper de pagination existant, jamais en réécrire un.',
      sourceAttemptId: 'a-old',
      createdAt: RECENT_DATE,
    },
  ];
}

export interface FixtureOptions {
  issue?: Partial<IssueSnapshot>;
  settings?: Partial<ProjectSettings>;
  decisions?: number;
  neighbors?: number;
  attempts?: AttemptRecord[];
  lessons?: LessonRecord[];
}

export interface Fixture {
  issue: IssueSnapshot;
  settings: ProjectSettings;
  decisions: DecisionRecord[];
  neighbors: NeighborChange[];
  attempts: AttemptRecord[];
  lessons: LessonRecord[];
  deps: BriefDeps;
}

/** Jeu de données complet + dépendances doublures prêtes à injecter. */
export function makeFixture(options: FixtureOptions = {}): Fixture {
  const issue = makeIssue(options.issue ?? {});
  const settings = makeSettings(options.settings ?? {});
  const decisions = makeDecisions(options.decisions ?? 2);
  const neighbors = makeNeighbors(options.neighbors ?? 2);
  const attempts = options.attempts ?? makeAttempts();
  const lessons = options.lessons ?? makeLessons();
  const deps: BriefDeps = {
    collectIssue: async () => issue,
    collectProjectSettings: async () => settings,
    collectDecisions: async () => decisions,
    collectNeighborChanges: async () => neighbors,
    loadAttempts: async () => attempts,
    loadLessons: async () => lessons,
  };
  return { issue, settings, decisions, neighbors, attempts, lessons, deps };
}
