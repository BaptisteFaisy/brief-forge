/**
 * Outil `get-acceptance-criteria` (GET) — les critères d'acceptation du ticket,
 * numérotés pour être cités tels quels dans un compte rendu (« critères
 * couverts : 1, 2, 4 »).
 *
 * La règle de lecture (champ dédié du projet, sinon liste portée par le
 * ticket) est **celle du brief** : `criteriaLines` est réutilisé pour que
 * l'outil et le brief ne divergent jamais.
 */

import { criteriaLines } from '../brief';
import type { BriefInput } from '../brief';
import { collectIssue } from '../collect/issueCollector';
import type { IssueSnapshot, ProjectSettings } from '../collect/types';
import { authorizeAndLog, requireIssueKey, resolveSettings } from './readHelpers';
import { runAction } from './shared';

/** Un critère d'acceptation daté et sourcé (BC-02). */
export interface CriterionEntry {
  index: number;
  text: string;
  source: string;
  date: string;
}

/** Entrée minimale attendue par `criteriaLines` : seules ces deux sources servent. */
function criteriaInput(issue: IssueSnapshot, settings: ProjectSettings): BriefInput {
  return { issue, settings, decisions: [], neighbors: [], attempts: [], lessons: [] };
}

export async function getAcceptanceCriteria(payload: any, context: any): Promise<any> {
  return runAction('get-acceptance-criteria', async () => {
    const issueKey = requireIssueKey(payload);
    await authorizeAndLog(issueKey, 'get-acceptance-criteria', context);

    const issue = await collectIssue(issueKey);
    const settings = await resolveSettings(issue.projectKey);
    const source = `Jira ${issue.issueKey}`;
    const criteria: CriterionEntry[] = criteriaLines(criteriaInput(issue, settings)).map(
      (text, position) => ({
        index: position + 1,
        text,
        source,
        date: issue.updatedAt,
      })
    );
    return { issueKey, criteria };
  });
}
