import React from 'react';
import { Inline, Lozenge, Text } from '@forge/react';
import { Language } from '../data';
import { tf, t } from '../i18n';

export interface ScoreBadgeProps {
  score: number;
  language?: Language;
}

export interface ScoreCategory {
  statusKey: 'statusReady' | 'statusNeedsPrecision' | 'statusNotReady';
  appearance: 'success' | 'moved' | 'removed';
}

/** Seuils alignés sur READINESS_THRESHOLDS (config.ts) : 70 prêt, 40 à préciser. */
export function getScoreCategory(score: number): ScoreCategory {
  if (score >= 70) return { statusKey: 'statusReady', appearance: 'success' };
  if (score >= 40) return { statusKey: 'statusNeedsPrecision', appearance: 'moved' };
  return { statusKey: 'statusNotReady', appearance: 'removed' };
}

/** « Préparation : N / 100 » suivi de la lozenge de statut. */
export const ScoreBadge = ({ score, language = 'fr' }: ScoreBadgeProps) => {
  const category = getScoreCategory(score);
  return (
    <Inline space="space.100" alignBlock="center">
      <Text>{tf('readinessScore', language, { score })}</Text>
      <Lozenge appearance={category.appearance}>{t(category.statusKey, language)}</Lozenge>
    </Inline>
  );
};
