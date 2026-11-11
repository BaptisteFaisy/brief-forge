import { Language, UIAttemptItem, UIProjectIssue } from './data';

/**
 * État des écrans et transitions pures (aucun appel réseau, aucune dépendance
 * Forge) : testables directement, les composants ne font que les brancher.
 */

export interface IssueContextView {
  language: Language;
  briefOpen: boolean;
  attempts: UIAttemptItem[];
}

export interface ProjectSettingsView {
  language: Language;
  saved: boolean;
}

export interface SimpleView {
  language: Language;
}

export function toggleLanguage(language: Language): Language {
  return language === 'fr' ? 'en' : 'fr';
}

/** La tentative la plus récente d'abord (tri décroissant sur la date de début). */
export function sortAttempts(attempts: UIAttemptItem[]): UIAttemptItem[] {
  return [...attempts].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

export function latestAttempt(attempts: UIAttemptItem[]): UIAttemptItem | undefined {
  return sortAttempts(attempts)[0];
}

export function updateAttempt(
  attempts: UIAttemptItem[],
  attemptId: string,
  patch: Partial<UIAttemptItem>
): UIAttemptItem[] {
  return attempts.map((attempt) => (attempt.id === attemptId ? { ...attempt, ...patch } : attempt));
}

export function confirmAttempt(attempts: UIAttemptItem[], attemptId: string): UIAttemptItem[] {
  return updateAttempt(attempts, attemptId, { confirmed: true, correctionRequested: false });
}

export function requestCorrection(attempts: UIAttemptItem[], attemptId: string): UIAttemptItem[] {
  return updateAttempt(attempts, attemptId, { correctionRequested: true, confirmed: false });
}

export function initialIssueContextView(attempts: UIAttemptItem[], language: Language = 'fr'): IssueContextView {
  return { language, briefOpen: false, attempts: sortAttempts(attempts) };
}

export function openBrief(view: IssueContextView): IssueContextView {
  return { ...view, briefOpen: true };
}

export function closeBrief(view: IssueContextView): IssueContextView {
  return { ...view, briefOpen: false };
}

export interface GroupedIssues {
  ready: UIProjectIssue[];
  inProgress: UIProjectIssue[];
  reported: UIProjectIssue[];
}

export function groupIssuesByStatus(issues: UIProjectIssue[]): GroupedIssues {
  return {
    ready: issues.filter((issue) => issue.status === 'ready'),
    inProgress: issues.filter((issue) => issue.status === 'in_progress'),
    reported: issues.filter((issue) => issue.status === 'reported'),
  };
}

/** Part des comptes rendus confirmés sans correction, recalculée depuis la liste. */
export function confirmedWithoutCorrectionRate(issues: UIProjectIssue[]): number {
  const reported = issues.filter((issue) => issue.status === 'reported');
  if (reported.length === 0) return 0;
  const confirmed = reported.filter((issue) => issue.confirmedWithoutCorrection).length;
  return Math.round((confirmed / reported.length) * 100);
}

/** Compte les rendus déposés sans tests : ils portent l'avertissement dédié. */
export function countUnverifiedReports(issues: UIProjectIssue[]): number {
  return issues.filter((issue) => issue.unverifiedWithoutTests).length;
}
