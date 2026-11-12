import React from 'react';
import { Button, ButtonGroup, Stack } from '@forge/react';
import { Language, UIAttemptItem } from '../data';
import { t } from '../i18n';
import { Notice } from './Notice';

export interface ConfirmButtonsProps {
  attempt: UIAttemptItem;
  language?: Language;
  onConfirm: (attemptId: string) => void;
  onCorrect: (attemptId: string) => void;
}

/** Confirmer / Corriger le dernier compte rendu, avec retour d'état explicite. */
export const ConfirmButtons = ({ attempt, language = 'fr', onConfirm, onCorrect }: ConfirmButtonsProps) => (
  <Stack space="space.100">
    <ButtonGroup>
      <Button appearance="primary" isDisabled={attempt.confirmed} onClick={() => onConfirm(attempt.id)}>
        {t('confirm', language)}
      </Button>
      <Button
        appearance="subtle"
        isDisabled={attempt.correctionRequested}
        onClick={() => onCorrect(attempt.id)}
      >
        {t('correct', language)}
      </Button>
    </ButtonGroup>
    {attempt.confirmed ? <Notice appearance="success" text={t('confirmedMessage', language)} /> : null}
    {attempt.correctionRequested ? (
      <Notice appearance="warning" text={t('correctionMessage', language)} />
    ) : null}
  </Stack>
);
