/**
 * Entrées du moteur de brief.
 *
 * Les formes de données ne sont **pas** redéfinies ici : elles viennent des
 * modules propriétaires (`src/collect/types` pour Jira/Confluence,
 * `src/storage/types` pour les tentatives et les leçons), conformément au
 * contrat § 4.1/§ 4.4. Ce fichier ajoute seulement ce qui est propre au brief :
 * le contexte agrégé (`BriefInput`) et la forme d'une source citée.
 */

import type {
  DecisionRecord,
  IssueSnapshot,
  NeighborChange,
  ProjectSettings,
} from '../collect/types';
import type { AttemptRecord, LessonRecord } from '../storage/types';
import type { BriefLang } from './labels';

export type {
  DecisionRecord,
  IssueComment,
  IssueHistoryEntry,
  IssueLink,
  IssueSnapshot,
  NeighborChange,
  ProjectSettings,
} from '../collect/types';

export type { AttemptRecord, LessonRecord } from '../storage/types';

/** Une source affichée en section 10 (toujours datée, BC-02). */
export interface SourceRef {
  label: string;
  url: string;
  date: string;
}

/**
 * Leçon telle que la fournit la boucle d'apprentissage (`src/review`) : une
 * leçon stockée, plus le marqueur « ancienne » au-delà de l'âge maximal. Le
 * marqueur est optionnel : une `LessonRecord` brute reste assignable.
 */
export type BriefLesson = LessonRecord & { stale?: boolean };

/** Contexte complet d'une construction de brief, après collecte. */
export interface BriefInput {
  issue: IssueSnapshot;
  settings: ProjectSettings;
  decisions: DecisionRecord[];
  neighbors: NeighborChange[];
  attempts: AttemptRecord[];
  lessons: BriefLesson[];
  /** Collectes en échec : remontées en section « Trous », jamais comblées. */
  errors?: string[];
  /**
   * Langue du ticket, détectée à la collecte (`detectIssueLanguage`) : tous les
   * libellés du moteur sont rendus dans cette langue. Absente = français, le
   * rendu historique — les contextes construits à la main restent inchangés.
   */
  lang?: BriefLang;
}
