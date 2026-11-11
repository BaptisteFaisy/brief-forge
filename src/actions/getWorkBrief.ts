/**
 * Outil `get-work-brief` (GET) — le brief de travail d'un ticket : sourcé,
 * daté, calibré en jetons.
 *
 * Le brief précalculé est servi tel quel tant qu'il n'est pas périmé ; sinon il
 * est reconstruit à la volée et réenregistré. Une action dispose de 55 s
 * (contrat § 4.6) : la construction est donc gardée à 40 s et, si elle expire,
 * on **se replie sur le budget `s`** (≈1 000 jetons, le moins coûteux à
 * produire) plutôt que de rendre la main sans brief.
 */

import { buildBrief } from '../brief';
import { loadBrief, saveBrief } from '../storage';
import type { StoredBrief } from '../storage';
import { BriefData, Budget } from '../types';
import { authorizeAndLog, isoNow, requireIssueKey } from './readHelpers';
import { parseBudget, runAction } from './shared';

/** Garde de temps de la construction : 40 s sur les 55 s accordées à l'action. */
const BUILD_DEADLINE_MS = 40_000;

/** Budget de repli quand la construction du budget demandé dépasse la garde. */
const FALLBACK_BUDGET: Budget = 's';

class BuildDeadlineError extends Error {
  constructor(ms: number) {
    super(`Construction du brief interrompue après ${Math.round(ms / 1000)} s.`);
    this.name = 'BuildDeadlineError';
  }
}

/** Borne une promesse dans le temps (le travail sous-jacent n'est pas annulé). */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BuildDeadlineError(ms)), ms);
  });
  return Promise.race([work, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Construit le brief, avec repli documenté sur le budget `s` si la garde de
 * 40 s est dépassée. Un autre échec (collecte indisponible, ticket introuvable)
 * remonte tel quel : il ne doit pas être maquillé en brief vide.
 */
async function buildWithinDeadline(issueKey: string, budget: Budget): Promise<BriefData> {
  try {
    return await withDeadline(buildBrief(issueKey, budget), BUILD_DEADLINE_MS);
  } catch (error) {
    if (budget === FALLBACK_BUDGET || !(error instanceof BuildDeadlineError)) throw error;
    console.warn(
      `[action:get-work-brief] budget ${budget} interrompu après ${BUILD_DEADLINE_MS / 1000} s : repli sur le budget ${FALLBACK_BUDGET}.`
    );
    return withDeadline(buildBrief(issueKey, FALLBACK_BUDGET), BUILD_DEADLINE_MS);
  }
}

/** Relit le JSON stocké ; `null` si le contenu est illisible (on reconstruira). */
function parseStoredBrief(stored: StoredBrief): BriefData | null {
  try {
    const data = JSON.parse(stored.contentJson) as BriefData;
    if (!data || typeof data.markdown !== 'string') return null;
    return { ...data, markdown: data.markdown || stored.contentMd };
  } catch {
    return null;
  }
}

/** Brief frais servi depuis le stockage, sinon construction + enregistrement. */
async function loadFreshOrBuild(issueKey: string, budget: Budget): Promise<BriefData> {
  const stored = await loadBrief(issueKey, budget);
  const cached = stored && !stored.stale ? parseStoredBrief(stored) : null;
  if (cached) return cached;

  const brief = await buildWithinDeadline(issueKey, budget);
  try {
    await saveBrief(brief, isoNow());
  } catch (error) {
    // Le brief est valide même si la mise en cache échoue : on le rend quand même.
    console.warn(`[action:get-work-brief] enregistrement impossible : ${String(error)}`);
  }
  return brief;
}

export async function getWorkBrief(payload: any, context: any): Promise<any> {
  return runAction('get-work-brief', async () => {
    const issueKey = requireIssueKey(payload);
    const budget = parseBudget(payload);
    await authorizeAndLog(issueKey, 'get-work-brief', context);
    const brief = await loadFreshOrBuild(issueKey, budget);
    // `budget` reflète le budget réellement servi (repli `s` inclus).
    return { issueKey, budget: brief.budget, markdown: brief.markdown, data: brief };
  });
}
