/** @jsx ForgeUI.createElement */
import ForgeUI, { Button, ButtonSet, Code, Fragment, ModalDialog, SectionMessage, Text } from '@forge/ui';
import { BriefData } from '../../types';
import { Language } from '../data';
import { tf, t } from '../i18n';

export interface BriefViewerProps {
  brief: BriefData;
  isOpen: boolean;
  onClose: () => void;
  language?: Language;
}

/** Affiche le brief exactement tel que l'agent le recevra (markdown brut). */
export const BriefViewer = ({ brief, isOpen, onClose, language = 'fr' }: BriefViewerProps) => {
  if (!isOpen) return null;

  const title = tf('briefModalTitle', language, {
    issueKey: brief.issueKey,
    budget: brief.budget.toUpperCase(),
    tokens: brief.tokenTarget,
  });

  return (
    <ModalDialog header={title} onClose={onClose} width="large" closeButtonText={t('close', language)}>
      <Fragment>
        <SectionMessage appearance="info">
          <Text>{t('briefPreviewNote', language)}</Text>
        </SectionMessage>
        <Code text={brief.markdown} language="text" />
      </Fragment>
    </ModalDialog>
  );
};

export interface BriefButtonProps {
  onOpen: () => void;
  language?: Language;
}

export const BriefButton = ({ onOpen, language = 'fr' }: BriefButtonProps) => (
  <ButtonSet>
    <Button text={t('viewBrief', language)} appearance="primary" onClick={onOpen} />
  </ButtonSet>
);
