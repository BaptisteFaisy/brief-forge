import React, { useState } from 'react';
import { Heading, Stack, Text } from '@forge/react';
import { BriefData, ReadinessScore } from '../types';
import { Language, UIAttemptItem } from './data';
import { tf, t } from './i18n';
import {
  IssueContextView,
  closeBrief,
  confirmAttempt,
  initialIssueContextView,
  latestAttempt,
  openBrief,
  requestCorrection,
  toggleLanguage,
} from './state';
import { AttemptHistory } from './components/AttemptHistory';
import { BriefButton, BriefViewer } from './components/BriefViewer';
import { GapList } from './components/GapList';
import { Notice } from './components/Notice';
import { PageHeader } from './components/PageHeader';
import { ScoreBadge } from './components/ScoreBadge';
import { Screen, Section } from './components/Screen';

export interface IssueContextProps {
  issueKey: string;
  readiness: ReadinessScore;
  brief: BriefData;
  attempts: UIAttemptItem[];
  language?: Language;
}

export interface IssueContextHandlers {
  onToggleLanguage: () => void;
  onOpenBrief: () => void;
  onCloseBrief: () => void;
  onConfirm: (attemptId: string) => void;
  onCorrect: (attemptId: string) => void;
}

/** Bloc « Préparation » : score, conseil, manques chiffrés, accès au brief. */
function ReadinessSection({
  readiness,
  language,
  onOpenBrief,
}: {
  readiness: ReadinessScore;
  language: Language;
  onOpenBrief: () => void;
}) {
  return (
    <>
      <Section>
        <Heading size="small">{t('readiness', language)}</Heading>
        <ScoreBadge score={readiness.score} language={language} />
        <Text>{tf('advice', language, { advice: readiness.advice })}</Text>
      </Section>
      <GapList gaps={readiness.gaps} language={language} />
      <BriefButton onOpen={onOpenBrief} language={language} />
    </>
  );
}

/** Bloc « Dernier compte rendu » : avertissement s'il n'est vérifié par aucun test. */
function LatestReportSection({ latest, language }: { latest?: UIAttemptItem; language: Language }) {
  return (
    <Section>
      <Heading size="small">{t('latestReport', language)}</Heading>
      {latest && !latest.hasTests ? (
        <Notice
          appearance="warning"
          title={t('notVerifiedByTests', language)}
          text={t('noTestsWarning', language)}
        />
      ) : null}
    </Section>
  );
}

/**
 * Écran `jira:issueContext` : préparation du ticket, manques, aperçu du brief,
 * historique des tentatives et validation du dernier compte rendu.
 * Version pure (sans état) : directement testable.
 */
export function renderIssueContext(
  props: IssueContextProps,
  view: IssueContextView,
  handlers: IssueContextHandlers
) {
  const language = view.language;
  const latest = latestAttempt(view.attempts);

  return (
    <Screen>
      <PageHeader
        title={tf('issueContextTitle', language, { issueKey: props.issueKey })}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />
      <ReadinessSection
        readiness={props.readiness}
        language={language}
        onOpenBrief={handlers.onOpenBrief}
      />
      <LatestReportSection latest={latest} language={language} />
      <Stack space="space.050">
        <Heading size="small">{t('attemptsTitle', language)}</Heading>
        <AttemptHistory
          attempts={view.attempts}
          language={language}
          latestId={latest ? latest.id : undefined}
          onConfirm={handlers.onConfirm}
          onCorrect={handlers.onCorrect}
        />
      </Stack>
      <BriefViewer
        brief={props.brief}
        isOpen={view.briefOpen}
        onClose={handlers.onCloseBrief}
        language={language}
      />
    </Screen>
  );
}

/** Composant Forge du module `jira:issueContext`. */
export const IssueContext = (props: IssueContextProps) => {
  const [view, setView] = useState<IssueContextView>(() =>
    initialIssueContextView(props.attempts, props.language)
  );

  const handlers: IssueContextHandlers = {
    onToggleLanguage: () => setView({ ...view, language: toggleLanguage(view.language) }),
    onOpenBrief: () => setView(openBrief(view)),
    onCloseBrief: () => setView(closeBrief(view)),
    onConfirm: (attemptId: string) => setView({ ...view, attempts: confirmAttempt(view.attempts, attemptId) }),
    onCorrect: (attemptId: string) => setView({ ...view, attempts: requestCorrection(view.attempts, attemptId) }),
  };

  return renderIssueContext(props, view, handlers);
};

export default IssueContext;
