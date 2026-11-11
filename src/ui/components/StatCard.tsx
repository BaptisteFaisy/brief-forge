/** @jsx ForgeUI.createElement */
import ForgeUI, { Button, ButtonSet, Fragment, Heading, Strong, Text } from '@forge/ui';
import { Language } from '../data';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

/** Indicateur du projet : une valeur mise en avant, un libellé, une précision. */
export const StatCard = ({ label, value, hint }: StatCardProps) => (
  <Fragment>
    <Heading size="small">{label}</Heading>
    <Text>
      <Strong>{value}</Strong>
    </Text>
    {hint ? <Text>{hint}</Text> : null}
  </Fragment>
);

export interface LanguageToggleProps {
  language: Language;
  onToggle: () => void;
}

/** Bascule FR/EN minimale, sans dépendance i18n : le bouton montre la langue cible. */
export const LanguageToggle = ({ language, onToggle }: LanguageToggleProps) => (
  <ButtonSet>
    <Button
      text={language === 'fr' ? 'EN' : 'FR'}
      appearance="subtle"
      onClick={onToggle}
    />
  </ButtonSet>
);
