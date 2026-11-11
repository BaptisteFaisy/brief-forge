/**
 * Outil `list-ready-work` (GET) — les tickets d'un projet déjà prêts à être
 * confiés à un agent (score ≥ `READINESS_THRESHOLDS.ready`), le meilleur
 * d'abord.
 *
 * L'outil ne relit pas chaque ticket : il ne renvoie que les scores déjà
 * calculés et stockés. Il ne révèle donc aucun contenu de ticket, seulement
 * des clés, des scores et des statuts — d'où l'absence de sonde d'accès
 * ticket par ticket (le contrôle d'accès de Jira s'applique aux outils qui
 * renvoient du contenu, cf. `authorizeAndLog`).
 */

import { READINESS_THRESHOLDS } from '../config';
import { loadProjectReadiness, requireProjectKey } from './readHelpers';
import { runAction } from './shared';

/** Un ticket prêt, réduit à ce qui permet de choisir quoi faire ensuite. */
export interface ReadyTicket {
  issueKey: string;
  score: number;
  status: string;
}

/** Filtre au seuil « prêt » et trie du meilleur score au moins bon. */
function readyTickets(rows: ReadyTicket[]): ReadyTicket[] {
  return rows
    .filter((row) => row.score >= READINESS_THRESHOLDS.ready)
    .sort((a, b) => b.score - a.score)
    .map((row) => ({ issueKey: row.issueKey, score: row.score, status: row.status }));
}

export async function listReadyWork(payload: any, context: any): Promise<any> {
  return runAction('list-ready-work', async () => {
    const projectKey = requireProjectKey(payload);
    const rows = await loadProjectReadiness(projectKey);
    return { projectKey, tickets: readyTickets(rows) };
  });
}
