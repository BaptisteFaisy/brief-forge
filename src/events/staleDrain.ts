/**
 * Drain planifié des briefs périmés — filet de sécurité du précalcul.
 *
 * Le chemin nominal est : événement Jira → trigger → file platform → consumer.
 * Si un message de la file platform se perd, ou si le consumer échoue trois
 * fois (`MAX_QUEUE_ATTEMPTS`), plus rien ne rattrape le ticket : son brief
 * reste marqué périmé jusqu'au prochain événement.
 *
 * Ce module est appelé par un `scheduledTrigger` (une fois par heure, voir
 * `INTEGRATION-NOTES.md`) : il liste les tickets dont un brief stocké est
 * encore périmé, les remet en file, puis rejoue **le consumer existant** —
 * aucune logique de construction n'est dupliquée : le budget de temps, le
 * plafond de tickets, le verrou par ticket et le contrôle de fraîcheur sont
 * ceux de `consumeBriefQueue`.
 *
 * Un ticket dont le brief est redevenu frais entre-temps n'est pas reconstruit
 * (le consumer le saute) : le drain est donc sans effet sur un système sain.
 */

import { BriefConsumerDeps, ConsumeReport, consumeBriefQueue } from './consumer';
import { Logger, consoleLogger, describeError } from './queue';

/** Raison de mise en file propre au drain (diagnostic). */
export const DRAIN_REASON = 'scheduled-drain' as const;

export interface StaleDrainDeps extends BriefConsumerDeps {
  /** Clés des tickets dont au moins un brief stocké est marqué périmé. */
  listStaleIssueKeys(): Promise<string[]>;
}

export interface StaleDrainReport {
  /** Tickets périmés au moment du drain. */
  staleIssueKeys: string[];
  /** Tickets remis en file par le drain (les autres y étaient déjà). */
  enqueued: string[];
  /** Résultat de la passe de construction (budget temps inclus). */
  consume: ConsumeReport;
}

/** Liste les briefs périmés sans jamais faire échouer le drain. */
async function listStaleKeys(deps: StaleDrainDeps, logger: Logger): Promise<string[]> {
  try {
    const keys = await deps.listStaleIssueKeys();
    return keys.filter((key) => typeof key === 'string' && key.trim() !== '');
  } catch (error) {
    logger.warn('Liste des briefs périmés illisible : drain limité à la file existante', {
      error: describeError(error),
    });
    return [];
  }
}

/** Remet les tickets périmés en file (la file déduplique déjà par ticket). */
async function enqueueStaleKeys(
  issueKeys: string[],
  deps: StaleDrainDeps,
  logger: Logger
): Promise<string[]> {
  const enqueued: string[] = [];
  for (const issueKey of issueKeys) {
    const result = await deps.queue.enqueue({ issueKey, reason: DRAIN_REASON });
    if (result === 'added') enqueued.push(issueKey);
  }
  logger.info('Drain planifié : tickets périmés remis en file', {
    stale: issueKeys.length,
    enqueued: enqueued.length,
  });
  return enqueued;
}

/**
 * Rejoue la construction sur les briefs encore périmés, dans le budget de
 * temps du consumer (`timeBudgetMs`, par défaut celui de `consumeBriefQueue`).
 */
export async function drainStaleBriefs(deps: StaleDrainDeps): Promise<StaleDrainReport> {
  const logger = deps.logger ?? consoleLogger;
  const staleIssueKeys = await listStaleKeys(deps, logger);
  const enqueued = await enqueueStaleKeys(staleIssueKeys, deps, logger);
  const consume = await consumeBriefQueue(deps);
  return { staleIssueKeys, enqueued, consume };
}
