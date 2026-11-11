/**
 * Types du score de préparation (WP-readiness).
 *
 * Les formes de données du ticket et des réglages viennent du contrat § 4.1
 * (`src/collect/types.ts`), `AttemptRecord` du contrat § 4.4
 * (`src/storage/types.ts`) : une seule déclaration pour tout le produit, aucun
 * type recopié. Ce fichier n'ajoute que ce qui est propre au score.
 */

import { READINESS_WEIGHTS } from '../config';
import type {
  DecisionRecord,
  IssueComment,
  IssueSnapshot,
  ProjectSettings,
} from '../collect/types';
import type { AttemptRecord } from '../storage/types';

export type {
  DecisionRecord,
  IssueComment,
  IssueHistoryEntry,
  IssueLink,
  IssueSnapshot,
  ProjectSettings,
} from '../collect/types';

export type { AttemptRecord } from '../storage/types';

/** Compléments optionnels passés au calcul (contrat § 4.3). */
export interface ReadinessExtras {
  decisions?: DecisionRecord[];
  comments?: IssueComment[];
  attempts?: AttemptRecord[];
}

/** Clé stable d'un critère : exactement les clés du barème de `config.ts`. */
export type CriterionKey = keyof typeof READINESS_WEIGHTS;

/** Entrée normalisée d'un critère : tout ce dont il a besoin, rien de plus. */
export interface CriterionInput {
  issue: IssueSnapshot;
  settings: ProjectSettings;
  decisions: DecisionRecord[];
  comments: IssueComment[];
  attempts: AttemptRecord[];
}

/**
 * Résultat d'un critère. `points` vaut soit le maximum du barème, soit 0 :
 * un critère est vérifié ou il ne l'est pas (pas de demi-point silencieux).
 * Dès que `passed` est faux, `reason` est **obligatoire** et rédigé en clair.
 */
export interface CriterionOutcome {
  criterion: CriterionKey;
  passed: boolean;
  points: number;
  maxPoints: number;
  reason?: string;
}

/** Signature commune des sept critères : une fonction autonome, testable. */
export type CriterionCheck = (input: CriterionInput) => CriterionOutcome;
