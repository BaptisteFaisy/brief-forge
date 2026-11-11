/**
 * Repo `brief` : un enregistrement par couple (ticket, budget).
 * Le brief est stocké sous trois formes : markdown (ce que lit l'agent),
 * JSON structuré (ce que réutilisent les autres outils) et JSON des sources.
 */

import { BriefData, Budget } from '../types';
import { getSqlClient } from './sqlClient';
import { TABLES } from './schema';
import {
  BRIEF_COLUMNS,
  briefToParams,
  rowToBrief,
} from './mappers';
import { BriefRow, StoredBrief } from './types';
import { buildSelect, buildUpsert, toJson, withDbError } from './helpers';

const UPSERT_BRIEF = buildUpsert(TABLES.brief, BRIEF_COLUMNS, ['issue_key', 'budget']);

/** Enregistre (ou remplace) le brief d'un ticket pour un budget donné. */
export async function saveBrief(brief: BriefData, builtAt: string): Promise<void> {
  const stored: StoredBrief = {
    issueKey: brief.issueKey,
    budget: brief.budget,
    contentMd: brief.markdown,
    contentJson: toJson(brief),
    sourcesJson: toJson(brief.sources),
    builtAt,
    stale: false,
  };
  await withDbError('saveBrief', () =>
    getSqlClient().execute(UPSERT_BRIEF, briefToParams(stored))
  );
}

/** Charge le brief d'un ticket pour un budget ; `null` s'il n'existe pas. */
export async function loadBrief(issueKey: string, budget: Budget): Promise<StoredBrief | null> {
  const rows = await withDbError('loadBrief', () =>
    getSqlClient().query<BriefRow>(buildSelect(TABLES.brief, ['issue_key', 'budget']), [
      issueKey,
      budget,
    ])
  );
  return rows.length > 0 ? rowToBrief(rows[0]) : null;
}

/**
 * Marque comme périmés **tous** les briefs du ticket, quel que soit le budget :
 * un changement du ticket invalide s, m et l en une seule instruction.
 */
export async function markBriefStale(issueKey: string): Promise<void> {
  await withDbError('markBriefStale', () =>
    getSqlClient().execute(`UPDATE ${TABLES.brief} SET stale = ? WHERE issue_key = ?`, [
      1,
      issueKey,
    ])
  );
}

/** Vrai si au moins un brief du ticket est marqué périmé. */
export async function hasStaleBrief(issueKey: string): Promise<boolean> {
  const rows = await withDbError('hasStaleBrief', () =>
    getSqlClient().query<BriefRow>(
      buildSelect(TABLES.brief, ['issue_key', 'stale']),
      [issueKey, 1]
    )
  );
  return rows.length > 0;
}
