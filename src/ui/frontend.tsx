/**
 * Point d'entrée du paquet UI (UI Kit 2 natif, `render: native`).
 *
 * `manifest.yml` déclare `resources: [{ key: main, path: src/ui/frontend.tsx }]`.
 * Forge compile ce fichier ; il aiguille sur le bon écran selon le module qui
 * l'appelle, charge les données par le résolveur (`invoke`) et rend l'écran
 * correspondant via `ForgeReconciler.render(...)`. Les écrans eux-mêmes
 * (`IssueContext.tsx`, `ProjectPage.tsx`, `ProjectSettingsPage.tsx`,
 * `ConnectHelp.tsx`) restent des fonctions pures testables.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

import { IssueContext } from './IssueContext';
import { ProjectPage } from './ProjectPage';
import { ProjectSettingsPage } from './ProjectSettingsPage';
import { ConnectHelp } from './ConnectHelp';
import { MOCK_ATTEMPTS, MOCK_BRIEF_DATA, MOCK_PROJECT_ISSUES, MOCK_PROJECT_METRICS,
  MOCK_PROJECT_SETTINGS } from './data';
import type { UIAttemptItem, UIProjectIssue, UIProjectMetrics,
  UIProjectSettingsFormData } from './data';
import { asSettings } from './ProjectSettingsPage';
import { Notice } from './components/Notice';
import { Screen } from './components/Screen';
import type { BriefData, ReadinessScore } from '../types';

/** Données chargées depuis le résolveur, écran par écran. */
interface IssueContextData {
  readiness: ReadinessScore | null;
  briefMarkdown: string | null;
  attempts: UIAttemptItem[];
}

interface ProjectPageData {
  issues: UIProjectIssue[];
  metrics: UIProjectMetrics | null;
}

/** Repli démonstration : le résolveur n'a rien renvoyé d'exploitable. */
const FALLBACK_ISSUE: IssueContextData = {
  readiness: null,
  briefMarkdown: null,
  attempts: MOCK_ATTEMPTS,
};

/** Écran `jira:issueContext` : préparation, manques, brief, tentatives. */
const IssueContextScreen = () => {
  const context = useProductContext();
  const [data, setData] = useState<IssueContextData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke('getIssueContext')
      .then((payload) => setData(normalizeIssueContext(payload)))
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  const issueKey = issueKeyOf(context);
  if (error) return <LoadError message={error} />;
  if (!data) return <Loading />;
  if (!data.readiness) return <LoadError message={`Aucun score de préparation pour ${issueKey}.`} />;

  return (
    <IssueContext
      issueKey={issueKey}
      readiness={data.readiness}
      brief={{ ...MOCK_BRIEF_DATA, ...briefOf(data), issueKey }}
      attempts={data.attempts}
    />
  );
};

/** Écran `jira:projectPage` : travail des agents du projet. */
const ProjectPageScreen = () => {
  const context = useProductContext();
  const [data, setData] = useState<ProjectPageData | null>(null);

  useEffect(() => {
    invoke('getProjectPage')
      .then((payload) => setData(normalizeProjectPage(payload)))
      .catch(() => setData({ issues: MOCK_PROJECT_ISSUES, metrics: MOCK_PROJECT_METRICS }));
  }, []);

  if (!data) return <Loading />;
  return (
    <ProjectPage
      projectKey={projectKeyOf(context)}
      issues={data.issues}
      metrics={data.metrics ?? MOCK_PROJECT_METRICS}
    />
  );
};

/** Écran `jira:projectSettingsPage` : réglages du projet. */
const ProjectSettingsScreen = () => {
  const context = useProductContext();
  const [settings, setSettings] = useState<UIProjectSettingsFormData | null>(null);

  useEffect(() => {
    invoke('getProjectSettings')
      .then((payload) => setSettings(
        asSettings(asRecord(asRecord(payload).settings), MOCK_PROJECT_SETTINGS)))
      .catch(() => setSettings(MOCK_PROJECT_SETTINGS));
  }, []);

  if (!settings) return <Loading />;
  return <ProjectSettingsPage projectKey={projectKeyOf(context)} settings={settings} />;
};

/** Aiguillage : un seul paquet, quatre vues. */
export const App = () => {
  const context = useProductContext();
  const type = moduleTypeOf(context);
  if (type === 'jira:projectSettingsPage') return <ProjectSettingsScreen />;
  if (type === 'jira:projectPage') return <ProjectPageScreen />;
  if (type === 'jira:issueContext') return <IssueContextScreen />;
  return <ConnectHelp appId={appIdOf(context)} />;
};

/* ------------------------------------------------------------------ */
/* Lecture du contexte et des charges                                   */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function moduleTypeOf(context: unknown): string {
  const record = asRecord(context);
  const extension = asRecord(record.extension);
  return String(extension.type ?? record.type ?? '');
}

function issueKeyOf(context: unknown): string {
  const record = asRecord(context);
  const extension = asRecord(record.extension);
  const issue = asRecord(extension.issue);
  return String(issue.key ?? record.issueKey ?? '');
}

function projectKeyOf(context: unknown): string {
  const record = asRecord(context);
  const extension = asRecord(record.extension);
  const project = asRecord(extension.project);
  return String(project.key ?? record.projectKey ?? '');
}

function appIdOf(context: unknown): string {
  const record = asRecord(context);
  return String(record.appId ?? '');
}

function normalizeIssueContext(payload: unknown): IssueContextData {
  const record = asRecord(payload);
  return {
    readiness: (record.readiness as ReadinessScore | null) ?? null,
    briefMarkdown: typeof record.briefMarkdown === 'string' ? record.briefMarkdown : null,
    attempts: Array.isArray(record.attempts) ? (record.attempts as UIAttemptItem[]) : FALLBACK_ISSUE.attempts,
  };
}

function normalizeProjectPage(payload: unknown): ProjectPageData {
  const record = asRecord(payload);
  return {
    issues: Array.isArray(record.issues) ? (record.issues as UIProjectIssue[]) : MOCK_PROJECT_ISSUES,
    metrics: (record.metrics as UIProjectMetrics | null) ?? null,
  };
}

/** Le brief renvoyé par le résolveur, sous la forme attendue par l'écran. */
function briefOf(data: IssueContextData): Partial<BriefData> {
  if (!data.briefMarkdown) return {};
  return { markdown: data.briefMarkdown };
}

function Loading() {
  return (
    <Screen>
      <Text>Chargement du brief…</Text>
    </Screen>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <Screen>
      <Notice appearance="warning" title="Brief indisponible" text={message} />
    </Screen>
  );
}

/* Le réconciliateur Forge prend la main sur le rendu : plus d'export `run`. */
ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
