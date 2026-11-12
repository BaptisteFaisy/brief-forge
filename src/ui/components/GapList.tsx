import React from 'react';
import { Stack, Text } from '@forge/react';
import { GapExplanation } from '../../types';
import { Language } from '../data';
import { tf, t } from '../i18n';
import { Notice } from './Notice';
import { Strong } from './Strong';

export interface GapListProps {
  gaps: GapExplanation[];
  language?: Language;
}

/** Liste chiffrée des manques : critère, points perdus, raison. */
export const GapList = ({ gaps, language = 'fr' }: GapListProps) => {
  if (!gaps || gaps.length === 0) {
    return <Notice appearance="success" text={t('noGaps', language)} />;
  }

  return (
    <Notice appearance="warning" title={tf('gapsTitle', language, { count: gaps.length })}>
      <Stack space="space.050">
        {gaps.map((gap) => (
          <Text key={gap.criterion}>
            <Strong>{gap.criterion}</Strong>
            {` (${tf('pointsLost', language, { points: gap.pointsLost })}) : ${gap.reason}`}
          </Text>
        ))}
      </Stack>
    </Notice>
  );
};
