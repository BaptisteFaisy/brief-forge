/** @jsx ForgeUI.createElement */
import ForgeUI, { Fragment, Heading, Text } from '@forge/ui';
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
  <Fragment>
    <Heading size="medium">{title}</Heading>
    <LanguageToggle language={language} onToggle={onToggleLanguage} />
    {subtitle ? <Text>{subtitle}</Text> : null}
  </Fragment>
);
