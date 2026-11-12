/**
 * Drain planifié des briefs périmés — filet de sécurité du précalcul.
 *
 * Le chemin nominal est : événement Jira → trigger → file platform → consumer.
 * Si un message de la file platform se perd, ou si le consumer échoue trois fois
 * (`MAX_QUEUE_ATTEMPTS`), plus rien ne rattrape le ticket : son brief reste
 * marqué périmé jusqu'au prochain événement.
 *
 * Ce module est appelé par un `scheduledTrigger` (une fois par heure) : il liste
 * les tickets dont un brief stocké est encore périmé, puis rejoue **le consumer
 * existant** sur cette liste. Aucune logique de construction n'est dupliquée :
 * le budget de temps, le plafond de tickets, le verrou par ticket et le contrôle
 * de fraîcheur sont ceux de `consumeBriefQueue`.
 *
 * ## Pourquoi une file en mémoire
 *
 * Un `scheduledTrigger` s'exécute sans contexte d'installation, et Forge y
 * **refuse le stockage global** : « Request principal is not authorized to use
 * storage resource » (observé en `development` le 12 novembre 2026 sur la
 * fonction `brief-rebuild-sched-fn`). La file persistante est donc inaccessible
 * au drain — alors que Forge SQL, lui, fonctionne : c'est lui qui fournit la
 * liste des briefs périmés.
 *
 * Le drain n'a pas besoin du journal persistant, la liste SQL fait autorité : il
 * passe au consumer une file **en mémoire** amorcée avec cette liste
 * (`src/events/memoryQueue.ts`). Deux conséquences, assumées :
 * - un ticket en attente dans la file persistante n'est pas drainé ici. Un ticket
 *   dont le brief n'a **jamais** été construit n'apparaît pas dans la table
 *   `brief`, donc n'est pas rattrapé par ce chemin — c'est le rôle du consumer
 *   déclenché par les événements ;
 * - les entrées en mémoire ne survivent pas à l'exécution : un échec de
 *   construction est repris au drain suivant, puisque le brief reste périmé en
 *   base.
 *
 * Un ticket dont le brief est redevenu frais entre-temps n'est pas reconstruit
 * (le consumer le saute) : sur un système sain, le drain coûte **un SELECT par
 * heure et rien d'autre** — aucun accès au stockage.
 */

import { BriefConsumerDeps, ConsumeReport, consumeBriefQueue } from './consumer';
import { memoryQueueFromKeys } from './memoryQueue';
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
  /** Tickets repris par le drain (file en mémoire : rien n'est écrit). */
  enqueued: string[];
  /** Résultat de la passe de construction (budget temps inclus). */
  consume: ConsumeReport;
  /** Vrai quand le drain n'avait rien à faire : aucun stockage touché. */
  skipped: boolean;
}

/** Rapport d'un drain qui n'a rien eu à faire. */
function emptyConsume(): ConsumeReport {
  return { processed: [], deferred: [], durationMs: 0, ok: true };
}

/** Liste les briefs périmés sans jamais faire échouer le drain. */
async function listStaleKeys(deps: StaleDrainDeps, logger: Logger): Promise<string[]> {
  try {
    const keys = await deps.listStaleIssueKeys();
    return keys.filter((key) => typeof key === 'string' && key.trim() !== '');
  } catch (error) {
    logger.warn('Liste des briefs périmés illisible : drain sans effet cette heure-ci', {
      error: describeError(error),
    });
    return [];
  }
}

/**
 * Rejoue la construction sur les briefs encore périmés, dans le budget de temps
 * du consumer (`timeBudgetMs`, par défaut celui de `consumeBriefQueue`).
 */
export async function drainStaleBriefs(deps: StaleDrainDeps): Promise<StaleDrainReport> {
  const logger = deps.logger ?? consoleLogger;
  const staleIssueKeys = await listStaleKeys(deps, logger);

  if (staleIssueKeys.length === 0) {
    logger.info('Drain planifié : aucun brief périmé, rien à reconstruire', { stale: 0 });
    return { staleIssueKeys: [], enqueued: [], consume: emptyConsume(), skipped: true };
  }

  const now = deps.now ?? ((): Date => new Date());
  const queue = await memoryQueueFromKeys(staleIssueKeys, DRAIN_REASON, logger, now);
  logger.info('Drain planifié : briefs périmés repris hors file persistante', {
    stale: staleIssueKeys.length,
  });
  const consume = await consumeBriefQueue({ ...deps, queue });
  return { staleIssueKeys, enqueued: staleIssueKeys, consume, skipped: false };
}
