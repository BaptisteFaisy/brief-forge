import React from 'react';
import { Button, ButtonGroup, Heading, Text } from '@forge/react';
import { Language } from '../data';
import { Section } from './Screen';
import { Strong } from './Strong';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

/** Indicateur du projet : une valeur mise en avant, un libellé, une précision. */
export const StatCard = ({ label, value, hint }: StatCardProps) => (
  <Section>
    <Heading size="small">{label}</Heading>
    <Strong>{value}</Strong>
    {hint ? <Text>{hint}</Text> : null}
  </Section>
);

export interface LanguageToggleProps {
  language: Language;
  onToggle: () => void;
}

/** Bascule FR/EN minimale, sans dépendance i18n : le bouton montre la langue cible. */
export const LanguageToggle = ({ language, onToggle }: LanguageToggleProps) => (
  <ButtonGroup>
    <Button appearance="subtle" onClick={onToggle}>
      {language === 'fr' ? 'EN' : 'FR'}
    </Button>
  </ButtonGroup>
);
