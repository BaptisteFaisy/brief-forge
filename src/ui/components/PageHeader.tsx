import React from 'react';
import { Heading, Stack, Text } from '@forge/react';
import { Language } from '../data';
import { LanguageToggle } from './StatCard';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  language: Language;
  onToggleLanguage: () => void;
}

/** En-tête commun aux quatre écrans : titre, bascule FR/EN, sous-titre. */
export const PageHeader = ({ title, subtitle, language, onToggleLanguage }: PageHeaderProps) => (
  <Stack space="space.100">
    <Heading size="medium">{title}</Heading>
    <LanguageToggle language={language} onToggle={onToggleLanguage} />
    {subtitle ? <Text>{subtitle}</Text> : null}
  </Stack>
);
