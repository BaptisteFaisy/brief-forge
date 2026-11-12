import React, { useState } from 'react';
import { Heading, Inline, Lozenge, Stack, Text } from '@forge/react';
import { Language, UIProjectIssue, UIProjectMetrics } from './data';
import { tf, t } from './i18n';
import { SimpleView, groupIssuesByStatus, toggleLanguage } from './state';
import { Notice } from './components/Notice';
import { PageHeader } from './components/PageHeader';
import { Screen, Section } from './components/Screen';
import { StatCard } from './components/StatCard';
import { Strong } from './components/Strong';

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

/** Un ticket de la file : clé, résumé, statut, préparation, agent, compte rendu. */
function IssueLine({ issue, language }: { issue: UIProjectIssue; language: Language }) {
  return (
    <Stack space="space.025">
      <Text>
        <Strong>{issue.issueKey}</Strong>
        {` — ${issue.summary}`}
      </Text>
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance={STATUS_APPEARANCE[issue.status]}>
          {t(STATUS_LABEL[issue.status], language)}
        </Lozenge>
        <Text>{tf('readinessShort', language, { score: issue.readinessScore })}</Text>
      </Inline>
      {issue.agentName ? <Text>{tf('agentLabel', language, { name: issue.agentName })}</Text> : null}
      {issue.lastReportSummary ? (
        <Text>{tf('reportLabel', language, { value: issue.lastReportSummary })}</Text>
      ) : null}
      {issue.unverifiedWithoutTests ? (
        <Notice appearance="warning" title={t('notVerifiedByTests', language)} text={t('noTestsWarning', language)} />
      ) : null}
    </Stack>
  );
}

/** Une colonne de la page projet (prêts / en cours / rendus). */
function IssueSection({
  titleKey,
  issues,
  language,
}: {
  titleKey: 'sectionReady' | 'sectionInProgress' | 'sectionReported';
  issues: UIProjectIssue[];
  language: Language;
}) {
  return (
    <Section>
      <Heading size="small">{t(titleKey, language)}</Heading>
      {issues.length === 0 ? <Text>{t('emptySection', language)}</Text> : null}
      <Stack space="space.150">
        {issues.map((issue) => (
          <IssueLine key={issue.issueKey} issue={issue} language={language} />
        ))}
      </Stack>
    </Section>
  );
}

/** Les quatre indicateurs du projet, dont les manques les plus fréquents. */
function Metrics({ metrics, language }: { metrics: UIProjectMetrics; language: Language }) {
  const gapLabel = (gap: UIProjectMetrics['topGaps'][number]) =>
    language === 'en' ? gap.labelEn : gap.labelFr;

  return (
    <Stack space="space.200">
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
      <Section>
        <Heading size="small">{t('topGapsTitle', language)}</Heading>
        <Stack space="space.025">
          {metrics.topGaps.map((gap) => (
            <Text key={gap.labelEn}>
              <Strong>{gapLabel(gap)}</Strong>
              {` — ${tf('topGapsOccurrences', language, { count: gap.count })}`}
            </Text>
          ))}
        </Stack>
      </Section>
    </Stack>
  );
}

/** Écran `jira:projectPage` « Travail des agents » : files d'attente et indicateurs. */
export function renderProjectPage(props: ProjectPageProps, view: SimpleView, handlers: ProjectPageHandlers) {
  const language = view.language;
  const grouped = groupIssuesByStatus(props.issues);

  return (
    <Screen>
      <PageHeader
        title={tf('projectPageTitle', language, { projectKey: props.projectKey })}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />
      <Metrics metrics={props.metrics} language={language} />
      <IssueSection titleKey="sectionReady" issues={grouped.ready} language={language} />
      <IssueSection titleKey="sectionInProgress" issues={grouped.inProgress} language={language} />
      <IssueSection titleKey="sectionReported" issues={grouped.reported} language={language} />
    </Screen>
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
