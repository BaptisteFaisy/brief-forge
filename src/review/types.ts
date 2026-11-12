/**
 * Types de la boucle d'apprentissage : revue humaine → leçon → brief (BC-14).
 *
 * Les formes stockées (`ReviewRecord`, `LessonRecord`, `AttemptRecord`) restent
 * celles du contrat § 4.4 : ce fichier n'ajoute que ce qui est propre à la
 * boucle (verdict, résultat d'une revue, leçon enrichie de sa provenance).
 */

import type { LessonRecord, ReviewRecord } from '../storage/types';

/** Verdict d'une revue : le compte rendu est confirmé, ou corrigé. */
export type ReviewVerdict = 'confirmé' | 'corrigé';

/** Raison pour laquelle aucune leçon n'a été créée. */
export type LessonSkipReason =
  | 'verdict-confirmé'
  | 'note-vide'
  | 'note-trop-courte'
  | 'projet-inconnu'
  | 'leçon-déjà-existante';

/** Entrée de `recordReview`. */
export interface RecordReviewInput {
  /** Tentative revue (le compte rendu produit par l'agent). */
  attemptId: string;
  /** Ticket concerné (`PAY-142`). */
  issueKey: string;
  /** Nom du relecteur humain (traçabilité de la revue). */
  reviewerName: string;
  /** `confirmé` ou `corrigé` (casse et accents ignorés). */
  verdict: ReviewVerdict | string;
  /** Note du relecteur : la correction, en clair. */
  note?: string;
  /** Composant/zone connu de l'appelant : prioritaire sur la déduction. */
  component?: string;
  /** Horodatage de la revue (injecté par les tests). */
  now?: Date;
}

/** Résultat d'une revue : ce qui a été écrit, et ce qui en est issu. */
export interface RecordReviewResult {
  /** La revue enregistrée. */
  review: ReviewRecord;
  /** Projet déduit de la clé du ticket (`PAY-142` → `PAY`). */
  projectKey: string;
  /** Composant/zone retenu pour la leçon (`''` = leçon de projet). */
  component: string;
  /** Leçon créée ou déjà existante ; `null` si aucune leçon n'a pu être écrite. */
  lesson: LessonRecord | null;
  /** Vrai si la leçon vient d'être créée (faux si elle existait déjà). */
  lessonCreated: boolean;
  /** Raison de l'absence de leçon ; `null` si la leçon a été créée. */
  lessonSkippedReason: LessonSkipReason | null;
}

/** Provenance d'une leçon : la tentative qui l'a fait naître. */
export interface LessonProvenance {
  attemptId: string;
  issueKey: string;
  agentName: string;
  startedAt: string;
}

/** Leçon enrichie : provenance + marqueur « ancienne ». */
export interface LessonForBrief extends LessonRecord {
  /** Vrai au-delà de l'âge maximal : encore renvoyée, mais signalée. */
  stale: boolean;
  /** Âge de la leçon en mois (entier). */
  ageMonths: number;
  /** Tentative d'origine ; `null` si elle n'est plus en base. */
  source: LessonProvenance | null;
}

/** Options de `lessonsForIssue`. */
export interface LessonsForIssueOptions {
  /** Composant/zone du ticket ; sinon la zone du projet est utilisée. */
  component?: string;
  /** Âge maximal d'une leçon en mois (défaut : `STALE_DECISION_MONTHS`). */
  maxAgeMonths?: number;
  /** Date de référence (défaut : maintenant). */
  now?: Date;
  /** Nombre maximal de leçons renvoyées (défaut : 20). */
  limit?: number;
}
