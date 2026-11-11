/** @jsx ForgeUI.createElement */
import ForgeUI, { Fragment, Heading, SectionMessage, Text, useState } from '@forge/ui';
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
import { PageHeader } from './components/PageHeader';
import { ScoreBadge } from './components/ScoreBadge';

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
    <Fragment>
      <PageHeader
        title={tf('issueContextTitle', language, { issueKey: props.issueKey })}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />

      <Heading size="small">{t('readiness', language)}</Heading>
      <ScoreBadge score={props.readiness.score} language={language} />
      <Text>{tf('advice', language, { advice: props.readiness.advice })}</Text>

      <GapList gaps={props.readiness.gaps} language={language} />
      <BriefButton onOpen={handlers.onOpenBrief} language={language} />

      <Heading size="small">{t('latestReport', language)}</Heading>
      {latest && !latest.hasTests ? (
        <SectionMessage appearance="warning" title={t('notVerifiedByTests', language)}>
          <Text>{t('noTestsWarning', language)}</Text>
        </SectionMessage>
      ) : null}

      <Heading size="small">{t('attemptsTitle', language)}</Heading>
      <AttemptHistory
        attempts={view.attempts}
        language={language}
        latestId={latest ? latest.id : undefined}
        onConfirm={handlers.onConfirm}
        onCorrect={handlers.onCorrect}
      />

      <BriefViewer
        brief={props.brief}
        isOpen={view.briefOpen}
        onClose={handlers.onCloseBrief}
        language={language}
      />
    </Fragment>
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
