export {
  MOCK_ATTEMPTS,
  MOCK_BRIEF_DATA,
  MOCK_PROJECT_ISSUES,
  MOCK_PROJECT_METRICS,
  MOCK_PROJECT_SETTINGS,
  MOCK_READINESS_SCORE,
  hasTestsInReport,
} from './data';
export type {
  Language,
  UIAttemptItem,
  UIProjectIssue,
  UIProjectMetrics,
  UIProjectSettingsFormData,
} from './data';

export { STRINGS, t, tf } from './i18n';
export type { StringKey } from './i18n';

export {
  closeBrief,
  confirmAttempt,
  confirmedWithoutCorrectionRate,
  countUnverifiedReports,
  groupIssuesByStatus,
  initialIssueContextView,
  latestAttempt,
  openBrief,
  requestCorrection,
  sortAttempts,
  toggleLanguage,
  updateAttempt,
} from './state';
export type { GroupedIssues, IssueContextView, ProjectSettingsView, SimpleView } from './state';

export { AttemptHistory } from './components/AttemptHistory';
export { BriefButton, BriefViewer } from './components/BriefViewer';
export { ConfirmButtons } from './components/ConfirmButtons';
export { GapList } from './components/GapList';
export { Notice } from './components/Notice';
export type { NoticeAppearance, NoticeProps } from './components/Notice';
export { PageHeader } from './components/PageHeader';
export { ScoreBadge, getScoreCategory } from './components/ScoreBadge';
export { Screen, Section } from './components/Screen';
export type { ScreenProps } from './components/Screen';
export { LanguageToggle, StatCard } from './components/StatCard';
export { Strong } from './components/Strong';
export type { StrongProps } from './components/Strong';

export { IssueContext, renderIssueContext } from './IssueContext';
export type { IssueContextHandlers, IssueContextProps } from './IssueContext';

export {
  ProjectSettingsPage,
  asSettings,
  renderProjectSettingsPage,
  staticSettingsForm,
} from './ProjectSettingsPage';
export type {
  ProjectSettingsHandlers,
  ProjectSettingsPageProps,
  SettingsFieldProps,
  SettingsForm,
} from './ProjectSettingsPage';

export { ProjectPage, renderProjectPage } from './ProjectPage';
export type { ProjectPageHandlers, ProjectPageProps } from './ProjectPage';

export { ConnectHelp, clientCommands, mcpServerUrl, renderConnectHelp } from './ConnectHelp';
export type { ClientCommand, ConnectHelpHandlers, ConnectHelpProps } from './ConnectHelp';
