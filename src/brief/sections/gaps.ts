/**
 * Section 9 — Trous (BC-03).
 *
 * On signale ce que le brief n'a **pas** trouvé, pour qu'aucun agent ne le
 * comble en inventant. Un trou est une question à poser, pas une hypothèse.
 */

import { formatDateFr } from '../../util/dates';
import { BriefInput } from '../inputs';
import { SectionSpec, rankOf, sourcedItem } from '../sectionBuilder';
import { criteriaLines } from './acceptanceCriteria';
import { failedAttempts } from './alreadyTried';

const NAME = 'Trous' as const;
const UNKNOWN = 'analyse du brief';
const MAX_DISCARDED_LISTED = 3;

/** Liste brute des trous détectés dans les données collectées. */
export function gapList(input: BriefInput): string[] {
  const { issue, settings, decisions, neighbors, lessons } = input;
  const gaps: string[] = [];
  if (criteriaLines(input).length === 0) {
    gaps.push("Aucun critère d'acceptation : impossible de savoir quand c'est fini.");
  }
  if (decisions.length === 0) {
    gaps.push('Aucune décision liée retrouvée : le pourquoi du code existant reste inconnu.');
  }
  if (neighbors.length === 0) {
    gaps.push('Aucun changement voisin : la zone de code touchée est inconnue.');
  }
  if (failedAttempts(input.attempts).length === 0) {
    gaps.push('Aucune tentative précédente enregistrée : on repart sans historique.');
  }
  if (lessons.length === 0) {
    gaps.push('Aucune leçon de projet : les pièges connus ne sont pas documentés.');
  }
  if (!issue.assignee) {
    gaps.push('Aucun assigné : personne n’est identifié comme responsable.');
  }
  if (issue.components.length === 0 && !settings.componentZone) {
    gaps.push('Aucun composant : périmètre technique non borné.');
  }
  for (const error of input.errors ?? []) {
    gaps.push(`Collecte incomplète — ${error}`);
  }
  gaps.push(...discardedNotices(input));
  return gaps;
}

/**
 * Un contenu écarté par la couche de sécurité (instruction adressée à un
 * agent) ne doit pas disparaître en silence : le brief dit **combien** de
 * passages ont été retirés, de qui et de quand, sans jamais les reproduire
 * (§ 13 : « retiré et remplacé par "contenu écarté…" » ; BC-03 : signaler
 * plutôt que combler).
 */
export function discardedNotices(input: BriefInput): string[] {
  const discarded = (input.issue.comments ?? []).filter((comment) => comment.discarded);
  if (discarded.length === 0) return [];
  const listed = discarded
    .slice(0, MAX_DISCARDED_LISTED)
    .map((comment) => `${comment.author}, ${formatDateFr(comment.createdAt)}`)
    .join(' ; ');
  const extra = discarded.length - MAX_DISCARDED_LISTED;
  const tail = extra > 0 ? ` et ${extra} autre(s)` : '';
  return [
    `${discarded.length} passage(s) écarté(s) du brief : instruction suspecte ` +
      `adressée à un agent (${listed}${tail}). Le contenu n'est pas reproduit — ` +
      'à vérifier par un humain avant de coder.',
  ];
}

export function buildGaps(input: BriefInput, builtAt: string): SectionSpec {
  const items = gapList(input).map((gap) => sourcedItem(gap, UNKNOWN, builtAt));
  return {
    name: NAME,
    rank: rankOf(NAME),
    title: NAME,
    tool: 'check-readiness',
    kind: 'bullets',
    items,
    emptyNote: '_Aucun trou détecté : le brief a trouvé tout ce qu’il cherchait._',
  };
}
