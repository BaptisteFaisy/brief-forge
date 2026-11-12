/**
 * Formes des indicateurs de projet (cahier des charges § 18).
 *
 * Règle commune : chaque indicateur renvoie son **dénominateur** et un drapeau
 * « données insuffisantes ». Sous le seuil d'échantillon, aucun pourcentage
 * n'est publié (`percent: null`) : on préfère « pas assez de données » à un
 * pourcentage inventé.
 */

/** Partie commune à tous les indicateurs. */
export interface MetricBase {
  /** Taille de l'échantillon observé (dénominateur du ratio). */
  denominator: number;
  /** Vrai si l'échantillon est trop petit pour conclure. */
  insufficientData: boolean;
  /** Ce que mesure l'indicateur, en clair (affichable tel quel). */
  description: string;
}

/** Indicateur exprimé en pourcentage. */
export interface RateMetric extends MetricBase {
  kind: 'rate';
  /** Cas favorables. */
  numerator: number;
  /** Pourcentage 0-100 ; `null` quand les données sont insuffisantes. */
  percent: number | null;
}

/** Indicateur exprimé en nombre. */
export interface CountMetric extends MetricBase {
  kind: 'count';
  /** Valeur comptée. */
  count: number;
}

/** Fréquence d'un manque de préparation. */
export interface GapFrequency {
  /** Libellé français du manque, tel que stocké par le score de préparation. */
  labelFr: string;
  /** Libellé anglais du même manque. */
  labelEn: string;
  /** Nombre de tickets concernés. */
  count: number;
}

/** Indicateur « manques les plus fréquents ». */
export interface GapMetric extends MetricBase {
  kind: 'gaps';
  /** Manques triés, les plus fréquents d'abord. */
  gaps: GapFrequency[];
}

/** Les quatre indicateurs d'un projet, avec leurs dénominateurs. */
export interface ProjectMetrics {
  confirmedWithoutCorrection: RateMetric;
  clarificationsAskedVsGuessed: RateMetric;
  repeatedAttemptsAvoided: CountMetric;
  topGaps: GapMetric;
}

/**
 * Forme attendue par l'écran projet : mêmes champs et mêmes types que
 * `UIProjectMetrics` (`src/ui/data.ts`). Un taux dont l'échantillon est
 * insuffisant vaut `null` — jamais `0`, qui serait un pourcentage inventé.
 */
export interface UiProjectMetrics {
  confirmedWithoutCorrectionRate: number | null;
  clarificationsAskedVsGuessedRate: number | null;
  repeatedAttemptsAvoidedCount: number;
  topGaps: Array<{ labelFr: string; labelEn: string; count: number }>;
}
