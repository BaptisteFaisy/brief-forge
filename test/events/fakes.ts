/**
 * Doublures partagées par les tests du module événements : aucun appel réseau,
 * aucun runtime Forge.
 */
import { BriefData, Budget } from '../../src/types';
import { BriefStorePort, StoredBriefSummary } from '../../src/events/consumer';
import { KeyValueStore, Logger } from '../../src/events/queue';
import { IssueState } from '../../src/events/triggers';

export class InMemoryStore implements KeyValueStore {
  readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export class RecordingLogger implements Logger {
  readonly lines: LogLine[] = [];

  info(message: string, context?: Record<string, unknown>): void {
    this.lines.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.lines.push({ level: 'warn', message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.lines.push({ level: 'error', message, context });
  }

  messages(level: LogLevel): string[] {
    return this.lines.filter((line) => line.level === level).map((line) => line.message);
  }
}

export function makeBrief(issueKey: string, budget: Budget): BriefData {
  return {
    issueKey,
    budget,
    tokenTarget: 0,
    objective: `Objectif de ${issueKey}`,
    acceptanceCriteria: [],
    applicableDecisions: [],
    failedAttempts: [],
    neighborChanges: [],
    constraints: [],
    lessons: [],
    whoToAsk: [],
    gaps: [],
    sources: [],
    markdown: `# Brief ${issueKey} (${budget})`,
  };
}

function briefKey(issueKey: string, budget: Budget): string {
  return `${issueKey}:${budget}`;
}

export class FakeBriefStore implements BriefStorePort {
  readonly saved: Array<{ issueKey: string; budget: Budget; builtAt: string }> = [];
  readonly briefs = new Map<string, StoredBriefSummary>();

  async saveBrief(brief: BriefData, builtAt: string): Promise<void> {
    this.saved.push({ issueKey: brief.issueKey, budget: brief.budget, builtAt });
    this.briefs.set(briefKey(brief.issueKey, brief.budget), { builtAt, stale: false });
  }

  async loadBrief(issueKey: string, budget: Budget): Promise<StoredBriefSummary | null> {
    return this.briefs.get(briefKey(issueKey, budget)) ?? null;
  }

  /** Simule une invalidation par un trigger Jira. */
  markStale(issueKey: string): void {
    for (const [key, value] of this.briefs.entries()) {
      if (key.startsWith(`${issueKey}:`)) this.briefs.set(key, { ...value, stale: true });
    }
  }
}

export function issueState(
  issueKey: string,
  status: string,
  labels: string[] = [],
  projectKey = 'PROJ'
): IssueState {
  return { issueKey, projectKey, status, labels };
}
