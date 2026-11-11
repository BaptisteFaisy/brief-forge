/**
 * Doublures de test du score de préparation.
 *
 * Aucun appel réseau : un ticket parfait, un ticket vide, et des fabriques
 * pour ne surcharger que ce qu'un test donné veut éprouver.
 */

import type {
  CriterionInput,
  DecisionRecord,
  IssueComment,
  IssueSnapshot,
  ProjectSettings,
} from '../../src/readiness/types';

/** Description d'un ticket réellement prêt : objectif + critères vérifiables. */
export const PERFECT_DESCRIPTION = [
  'Objectif : permettre l’export des factures au format CSV depuis la page Facturation.',
  '',
  '## Critères d’acceptation',
  '- Le bouton « Exporter » de la page Facturation renvoie un fichier CSV.',
  '- Le fichier CSV contient exactement 3 colonnes : numero, date, montant.',
  '- L’export refuse les périodes de plus de 12 mois avec un message d’erreur explicite.',
  '',
  '## Contraintes',
  'Rester dans le module facturation, aucune nouvelle dépendance.',
].join('\n');

export function makeIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    issueKey: 'PAY-123',
    projectKey: 'PAY',
    summary: 'Exporter les factures en CSV',
    description: PERFECT_DESCRIPTION,
    status: 'À faire',
    issueType: 'Story',
    components: ['Facturation'],
    labels: [],
    reporter: 'claire.martin',
    assignee: 'claire.martin',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-11-02T16:30:00.000Z',
    acceptanceCriteria: [],
    links: [],
    comments: [],
    history: [],
    customFields: {},
    ...overrides,
  };
}

/** Ticket vide : rien à confier à personne, aucun point gagné sans preuve. */
export function makeEmptyIssue(): IssueSnapshot {
  return makeIssue({
    summary: '',
    description: '',
    components: [],
    reporter: '',
    assignee: '',
  });
}

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    projectId: 'proj-pay',
    projectKey: 'PAY',
    triggerStatus: 'Prêt pour un agent',
    decisionLabels: ['decision'],
    ...overrides,
  };
}

export function makeComment(overrides: Partial<IssueComment> = {}): IssueComment {
  return {
    id: 'c1',
    author: 'claire.martin',
    createdAt: '2026-10-02T10:00:00.000Z',
    body: 'Merci de préciser le format attendu.',
    ...overrides,
  };
}

export function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    title: 'Décision de test',
    url: 'https://example.atlassian.net/wiki/x/1',
    date: '2026-05-01',
    author: 'archi',
    body: '',
    ...overrides,
  };
}

/** Entrée de critère complète, construite à partir des fabriques ci-dessus. */
export function makeInput(
  issueOverrides: Partial<IssueSnapshot> = {},
  settingsOverrides: Partial<ProjectSettings> = {},
  extras: { decisions?: DecisionRecord[]; comments?: IssueComment[] } = {}
): CriterionInput {
  const issue = makeIssue(issueOverrides);
  return {
    issue,
    settings: makeSettings(settingsOverrides),
    decisions: extras.decisions ?? [],
    comments: extras.comments ?? issue.comments,
    attempts: [],
  };
}
