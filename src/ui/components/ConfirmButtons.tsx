/** @jsx ForgeUI.createElement */
import ForgeUI, { Button, ButtonSet, Fragment, SectionMessage, Text } from '@forge/ui';
import { Language, UIAttemptItem } from '../data';
import { t } from '../i18n';

export interface ConfirmButtonsProps {
  attempt: UIAttemptItem;
  language?: Language;
  onConfirm: (attemptId: string) => void;
  onCorrect: (attemptId: string) => void;
}

/** Confirmer / Corriger le dernier compte rendu, avec retour d'état explicite. */
export const ConfirmButtons = ({ attempt, language = 'fr', onConfirm, onCorrect }: ConfirmButtonsProps) => (
  <Fragment>
    <ButtonSet>
      <Button
        text={t('confirm', language)}
        appearance="primary"
        disabled={attempt.confirmed}
        onClick={() => onConfirm(attempt.id)}
      />
      <Button
        text={t('correct', language)}
        appearance="subtle"
        disabled={attempt.correctionRequested}
        onClick={() => onCorrect(attempt.id)}
      />
    </ButtonSet>
    {attempt.confirmed ? (
      <SectionMessage appearance="confirmation">
        <Text>{t('confirmedMessage', language)}</Text>
      </SectionMessage>
    ) : null}
    {attempt.correctionRequested ? (
      <SectionMessage appearance="warning">
        <Text>{t('correctionMessage', language)}</Text>
      </SectionMessage>
    ) : null}
  </Fragment>
);
