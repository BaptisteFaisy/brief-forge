/**
 * Constructeur de briefs en arrière-plan (contrat § 4.7).
 *
 * Le consumer vide la file : pour chaque ticket il construit les **trois**
 * budgets (`s`, `m`, `l`), les enregistre, et journalise les erreurs sans
 * interrompre le reste du lot.
 *
 * Propriétés tenues :
 * - **idempotent** : un budget dont le brief stocké est encore frais
 *   (`stale === false`) n'est pas reconstruit ; une entrée retirée de la file
 *   avant construction évite de perdre un événement arrivé pendant le travail ;
 * - **borné dans le temps** : le lot s'arrête avant la limite d'exécution Forge
 *   et remet les tickets non traités dans la file (aucune tentative consommée).
 */
import { BRIEF_FRESHNESS_TARGET_MS } from '../config';
import { BriefData, Budget } from '../types';
import { BriefQueuePort, Logger, QueueEntry, consoleLogger, describeError } from './queue';

/** Les trois budgets construits pour chaque ticket déclenché. */
export const BRIEF_BUDGETS: readonly Budget[] = ['s', 'm', 'l'];

/** Marge sous la cible de fraîcheur (2 min) pour rendre la main avant la coupure Forge. */
export const DEFAULT_CONSUMER_TIME_BUDGET_MS = Math.floor(BRIEF_FRESHNESS_TARGET_MS * 0.8);

/**
 * Vue minimale d'un brief stocké (contrat § 4.4) : le consumer n'a besoin que
 * de savoir quand il a été construit et s'il est périmé.
 */
export interface StoredBriefSummary {
  builtAt: string;
  stale: boolean;
}

export interface BriefStorePort {
  saveBrief(brief: BriefData, builtAt: string): Promise<void>;
  loadBrief(issueKey: string, budget: Budget): Promise<StoredBriefSummary | null>;
}

export interface BriefConsumerDeps {
  queue: BriefQueuePort;
  buildBrief(issueKey: string, budget: Budget): Promise<BriefData>;
  store: BriefStorePort;
  logger?: Logger;
  now?: () => Date;
  /** Budget temps du lot, en millisecondes. */
  timeBudgetMs?: number;
  /** Plafond de tickets traités par exécution (le reste est différé). */
  maxIssuesPerRun?: number;
}

export interface BudgetOutcome {
  budget: Budget;
  built: boolean;
  /** `fresh` = brief stocké encore valide, reconstruction inutile. */
  skipped?: 'fresh';
  error?: string;
}

export type IssueStatus = 'built' | 'deferred' | 'failed';

export interface IssueOutcome {
  issueKey: string;
  status: IssueStatus;
  budgets: BudgetOutcome[];
}

export interface ConsumeReport {
  processed: IssueOutcome[];
  deferred: string[];
  durationMs: number;
  ok: boolean;
}

interface ConsumeContext {
  deps: BriefConsumerDeps;
  logger: Logger;
  now: () => Date;
  deadline: number;
}

/**
 * Réponse simple à la question « le brief utilisé par l'agent est-il périmé ? »,
 * consommée par `post-work-report` : absent = périmé, champ `stale` sinon.
 */
export function isBriefStale(stored: StoredBriefSummary | null): boolean {
  return !stored || stored.stale;
}

/** Même question, mais en lisant le dépôt : utile aux handlers d'actions. */
export async function isStoredBriefStale(
  store: BriefStorePort,
  issueKey: string,
  budget: Budget
): Promise<boolean> {
  return isBriefStale(await store.loadBrief(issueKey, budget));
}

async function buildOneBudget(
  issueKey: string,
  budget: Budget,
  context: ConsumeContext
): Promise<BudgetOutcome> {
  const { deps, logger, now } = context;
  try {
    const stored = await deps.store.loadBrief(issueKey, budget);
    if (!isBriefStale(stored)) return { budget, built: false, skipped: 'fresh' };
    const brief = await deps.buildBrief(issueKey, budget);
    await deps.store.saveBrief(brief, now().toISOString());
    logger.info(`Brief ${issueKey} (budget ${budget}) construit`, { issueKey, budget });
    return { budget, built: true };
  } catch (error) {
    const message = describeError(error);
    logger.error(`Échec de construction du brief ${issueKey} (budget ${budget})`, {
      issueKey,
      budget,
      error: message,
    });
    return { budget, built: false, error: message };
  }
}

/** Remet le ticket en file sans consommer de tentative : il sera repris au lot suivant. */
async function deferEntry(entry: QueueEntry, context: ConsumeContext): Promise<void> {
  context.logger.warn(`Temps du lot épuisé : brief ${entry.issueKey} remis dans la file`, {
    issueKey: entry.issueKey,
  });
  await context.deps.queue.enqueue({
    issueKey: entry.issueKey,
    projectKey: entry.projectKey,
    reason: entry.reason,
  });
}

async function processQueueEntry(
  entry: QueueEntry,
  context: ConsumeContext
): Promise<IssueOutcome> {
  const { deps, logger, now, deadline } = context;
  // Retiré AVANT construction : un événement reçu pendant le travail remet le
  // ticket dans la file, donc aucun rafraîchissement n'est perdu.
  await deps.queue.remove(entry.issueKey);
  const budgets: BudgetOutcome[] = [];
  for (const budget of BRIEF_BUDGETS) {
    if (now().getTime() >= deadline) {
      await deferEntry(entry, context);
      return { issueKey: entry.issueKey, status: 'deferred', budgets };
    }
    budgets.push(await buildOneBudget(entry.issueKey, budget, context));
  }
  const failures = budgets.filter((outcome) => outcome.error !== undefined);
  if (failures.length === 0) return { issueKey: entry.issueKey, status: 'built', budgets };
  const message = failures.map((outcome) => `${outcome.budget}: ${outcome.error}`).join(' | ');
  await deps.queue.recordFailure(entry, message);
  logger.warn(`Brief ${entry.issueKey} incomplet : ${failures.length} budget(s) en échec`, {
    issueKey: entry.issueKey,
  });
  return { issueKey: entry.issueKey, status: 'failed', budgets };
}

/**
 * Vide la file : construit les trois budgets des tickets en attente, dans la
 * limite du budget temps et du plafond de tickets par exécution.
 */
export async function consumeBriefQueue(deps: BriefConsumerDeps): Promise<ConsumeReport> {
  const logger = deps.logger ?? consoleLogger;
  const now = deps.now ?? (() => new Date());
  const startedAt = now().getTime();
  const deadline = startedAt + (deps.timeBudgetMs ?? DEFAULT_CONSUMER_TIME_BUDGET_MS);
  const context: ConsumeContext = { deps, logger, now, deadline };
  const entries = await deps.queue.list();
  const limit = deps.maxIssuesPerRun ?? entries.length;
  const processed: IssueOutcome[] = [];
  const deferred: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (index >= limit || now().getTime() >= deadline) {
      deferred.push(entry.issueKey);
      continue;
    }
    processed.push(await processQueueEntry(entry, context));
  }
  const ok = processed.every((outcome) => outcome.status !== 'failed');
  logger.info('File de construction traitée', {
    built: processed.filter((outcome) => outcome.status === 'built').length,
    deferred: deferred.length,
    ok,
  });
  return { processed, deferred, durationMs: now().getTime() - startedAt, ok };
}
