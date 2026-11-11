/** @jsx ForgeUI.createElement */
import ForgeUI, { Fragment, StatusLozenge, Text } from '@forge/ui';
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

export const ScoreBadge = ({ score, language = 'fr' }: ScoreBadgeProps) => {
  const category = getScoreCategory(score);
  return (
    <Fragment>
      <Text>{tf('readinessScore', language, { score })}</Text>
      <StatusLozenge text={t(category.statusKey, language)} appearance={category.appearance} />
    </Fragment>
  );
};
