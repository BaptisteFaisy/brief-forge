export type Budget = 's' | 'm' | 'l';

export type ReportStatus = 'terminé' | 'partiel' | 'bloqué' | 'abandonné';

export interface SourcedItem {
  text: string;
  source: string;
  date: string;
  stale?: boolean;
}

export interface BriefData {
  issueKey: string;
  budget: Budget;
  tokenTarget: number;
  objective: string;
  acceptanceCriteria: SourcedItem[];
  applicableDecisions: SourcedItem[];
  failedAttempts: SourcedItem[];
  neighborChanges: SourcedItem[];
  constraints: SourcedItem[];
  lessons: SourcedItem[];
  whoToAsk: SourcedItem[];
  gaps: string[];
  sources: Array<{ label: string; url: string; date: string }>;
  truncatedSections?: string[];
  markdown: string;
}

export interface GapExplanation {
  criterion: string;
  pointsLost: number;
  reason: string;
}

export interface ReadinessScore {
  issueKey: string;
  score: number;
  ready: boolean;
  status: 'prêt' | 'à préciser' | 'non prêt';
  gaps: GapExplanation[];
  advice: string;
}

export interface WorkReportPayload {
  issueKey: string;
  status: ReportStatus;
  report: string;
  criteriaCovered?: string;
  testsPassed?: string;
  authorName?: string;
  clientName?: string;
}

export interface FailedAttemptPayload {
  issueKey: string;
  summary: string;
  reason: string;
  agentName?: string;
}

export interface ClaimPayload {
  issueKey: string;
  agentName: string;
}

export interface ClarificationPayload {
  issueKey: string;
  question: string;
  authorAccountId?: string;
}
