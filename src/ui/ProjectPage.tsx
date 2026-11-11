/** @jsx ForgeUI.createElement */
import ForgeUI, { Fragment, Heading, SectionMessage, StatusLozenge, Strong, Text, useState } from '@forge/ui';
import { Language, UIProjectIssue, UIProjectMetrics } from './data';
import { tf, t } from './i18n';
import { SimpleView, groupIssuesByStatus, toggleLanguage } from './state';
import { PageHeader } from './components/PageHeader';
import { StatCard } from './components/StatCard';

export interface ProjectPageProps {
  projectKey: string;
  issues: UIProjectIssue[];
  metrics: UIProjectMetrics;
  language?: Language;
}

export interface ProjectPageHandlers {
  onToggleLanguage: () => void;
}

const STATUS_APPEARANCE: Record<UIProjectIssue['status'], 'new' | 'inprogress' | 'success'> = {
  ready: 'new',
  in_progress: 'inprogress',
  reported: 'success',
};

const STATUS_LABEL: Record<UIProjectIssue['status'], 'sectionReady' | 'sectionInProgress' | 'sectionReported'> = {
  ready: 'sectionReady',
  in_progress: 'sectionInProgress',
  reported: 'sectionReported',
};

function renderIssueLine(issue: UIProjectIssue, language: Language) {
  return (
    <Fragment key={issue.issueKey}>
      <Text>
        <Strong>{issue.issueKey}</Strong> — {issue.summary}
      </Text>
      <StatusLozenge text={t(STATUS_LABEL[issue.status], language)} appearance={STATUS_APPEARANCE[issue.status]} />
      <Text>{tf('readinessShort', language, { score: issue.readinessScore })}</Text>
      {issue.agentName ? <Text>{tf('agentLabel', language, { name: issue.agentName })}</Text> : null}
      {issue.lastReportSummary ? (
        <Text>{tf('reportLabel', language, { value: issue.lastReportSummary })}</Text>
      ) : null}
      {issue.unverifiedWithoutTests ? (
        <SectionMessage appearance="warning" title={t('notVerifiedByTests', language)}>
          <Text>{t('noTestsWarning', language)}</Text>
        </SectionMessage>
      ) : null}
    </Fragment>
  );
}

function renderSection(
  titleKey: 'sectionReady' | 'sectionInProgress' | 'sectionReported',
  issues: UIProjectIssue[],
  language: Language
) {
  return (
    <Fragment>
      <Heading size="small">{t(titleKey, language)}</Heading>
      {issues.length === 0 ? <Text>{t('emptySection', language)}</Text> : null}
      {issues.map((issue) => renderIssueLine(issue, language))}
    </Fragment>
  );
}

function renderMetrics(metrics: UIProjectMetrics, language: Language) {
  const gapLabel = (gap: UIProjectMetrics['topGaps'][number]) =>
    language === 'en' ? gap.labelEn : gap.labelFr;

  return (
    <Fragment>
      <StatCard
        label={t('metricConfirmed', language)}
        value={`${metrics.confirmedWithoutCorrectionRate} %`}
        hint={t('metricRateHint', language)}
      />
      <StatCard
        label={t('metricClarifications', language)}
        value={`${metrics.clarificationsAskedVsGuessedRate} %`}
        hint={t('metricRateHint', language)}
      />
      <StatCard
        label={t('metricRepeated', language)}
        value={String(metrics.repeatedAttemptsAvoidedCount)}
        hint={t('metricCountHint', language)}
      />
      <Heading size="small">{t('topGapsTitle', language)}</Heading>
      {metrics.topGaps.map((gap) => (
        <Text key={gap.labelEn}>
          <Strong>{gapLabel(gap)}</Strong> — {tf('topGapsOccurrences', language, { count: gap.count })}
        </Text>
      ))}
    </Fragment>
  );
}

/** Écran `jira:projectPage` « Travail des agents » : files d'attente et indicateurs. */
export function renderProjectPage(props: ProjectPageProps, view: SimpleView, handlers: ProjectPageHandlers) {
  const language = view.language;
  const grouped = groupIssuesByStatus(props.issues);

  return (
    <Fragment>
      <PageHeader
        title={tf('projectPageTitle', language, { projectKey: props.projectKey })}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />
      {renderMetrics(props.metrics, language)}
      {renderSection('sectionReady', grouped.ready, language)}
      {renderSection('sectionInProgress', grouped.inProgress, language)}
      {renderSection('sectionReported', grouped.reported, language)}
    </Fragment>
  );
}

export const ProjectPage = (props: ProjectPageProps) => {
  const [view, setView] = useState<SimpleView>(() => ({ language: props.language ?? 'fr' }));
  const handlers: ProjectPageHandlers = {
    onToggleLanguage: () => setView({ language: toggleLanguage(view.language) }),
  };
  return renderProjectPage(props, view, handlers);
};

export default ProjectPage;
