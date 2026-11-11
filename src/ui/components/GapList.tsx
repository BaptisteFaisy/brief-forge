/** @jsx ForgeUI.createElement */
import ForgeUI, { Fragment, SectionMessage, Strong, Text } from '@forge/ui';
import { GapExplanation } from '../../types';
import { Language } from '../data';
import { tf, t } from '../i18n';

export interface GapListProps {
  gaps: GapExplanation[];
  language?: Language;
}

export const GapList = ({ gaps, language = 'fr' }: GapListProps) => {
  if (!gaps || gaps.length === 0) {
    return (
      <SectionMessage appearance="confirmation">
        <Text>{t('noGaps', language)}</Text>
      </SectionMessage>
    );
  }

  return (
    <SectionMessage appearance="warning" title={tf('gapsTitle', language, { count: gaps.length })}>
      <Fragment>
        {gaps.map((gap) => (
          <Text key={gap.criterion}>
            <Strong>{gap.criterion}</Strong>
            {` (${tf('pointsLost', language, { points: gap.pointsLost })}) : ${gap.reason}`}
          </Text>
        ))}
      </Fragment>
    </SectionMessage>
  );
};
