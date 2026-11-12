import React from 'react';
import {
  Button,
  ButtonGroup,
  CodeBlock,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  Stack,
} from '@forge/react';
import { BriefData } from '../../types';
import { Language } from '../data';
import { tf, t } from '../i18n';
import { Notice } from './Notice';

export interface BriefViewerProps {
  brief: BriefData;
  isOpen: boolean;
  onClose: () => void;
  language?: Language;
}

/**
 * Affiche le brief exactement tel que l'agent le recevra (markdown brut).
 *
 * UI Kit 2 découpe `ModalDialog` (UI Kit 1) en `ModalTransition` + `Modal` +
 * en-tête / corps / pied ; le bouton de fermeture passe dans le pied.
 */
export const BriefViewer = ({ brief, isOpen, onClose, language = 'fr' }: BriefViewerProps) => {
  if (!isOpen) return null;

  const title = tf('briefModalTitle', language, {
    issueKey: brief.issueKey,
    budget: brief.budget.toUpperCase(),
    tokens: brief.tokenTarget,
  });

  return (
    <ModalTransition>
      <Modal onClose={onClose} width="large">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Stack space="space.200">
            <Notice appearance="information" text={t('briefPreviewNote', language)} />
            <CodeBlock text={brief.markdown} language="text" />
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            {t('close', language)}
          </Button>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};

export interface BriefButtonProps {
  onOpen: () => void;
  language?: Language;
}

export const BriefButton = ({ onOpen, language = 'fr' }: BriefButtonProps) => (
  <ButtonGroup>
    <Button appearance="primary" onClick={onOpen}>
      {t('viewBrief', language)}
    </Button>
  </ButtonGroup>
);
