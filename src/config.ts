import { Budget } from './types';

// Ré-export pratique : les modules qui manipulent un budget importent le type
// depuis `config` (constantes) ou depuis `types` (forme), sans duplication.
export type { Budget } from './types';

export const BUDGET_TOKENS: Record<Budget, number> = {
  s: 1000,
  m: 3000,
  l: 8000,
};

export const DEFAULT_BUDGET: Budget = 'm';

export const SECTION_ORDER = [
  'Objectif',
  'Critères d\'acceptation',
  'Décisions applicables',
  'Déjà tenté',
  'Changements voisins',
  'Contraintes',
  'Leçons',
  'À qui demander',
  'Trous',
  'Sources',
] as const;

export type SectionName = (typeof SECTION_ORDER)[number];

export const READINESS_WEIGHTS = {
  acceptanceCriteria: 30,
  boundedScope: 15,
  noBlockingLink: 15,
  noContradictoryDecision: 10,
  reachableAuthor: 10,
  noUnansweredQuestion: 10,
  componentIdentified: 10,
} as const;

export const READINESS_THRESHOLDS = {
  ready: 70,
  needsPrecision: 40,
} as const;

export const STALE_DECISION_MONTHS = 18;

export const CLAIM_EXPIRY_HOURS = 4;

export const ACCESS_LOG_RETENTION_DAYS = 90;

export const BRIEF_FRESHNESS_TARGET_MS = 2 * 60 * 1000;

export const MAX_COMMENTS_FOR_DECISION_SCAN = 10;
