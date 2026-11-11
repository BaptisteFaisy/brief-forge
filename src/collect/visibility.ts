/**
 * Visibilité des commentaires : ce qui peut alimenter le brief (WP-collect).
 *
 * Un commentaire à visibilité restreinte (rôle ou groupe Jira, ou `jsdPublic`
 * faux) reste dans `IssueSnapshot.comments` : l'information est conservée pour
 * un usage futur explicite, hors brief. En revanche il est **exclu** de tout ce
 * qui alimente le brief mis en cache et le score de préparation — ni son corps,
 * ni son auteur ne doivent y apparaître (contrat d'intégration, cas 8 :
 * « les commentaires à visibilité restreinte sont exclus du brief mis en
 * cache »).
 *
 * Un seul endroit décide de cette règle : les consommateurs (section « À qui
 * demander », critère « aucune question sans réponse », décisions marquées en
 * commentaire) appellent `citableComments` au lieu de réitérer le filtre.
 */

import type { IssueComment } from './types';

/** Vrai si le commentaire n'est pas visible de tous les lecteurs du ticket. */
export function isRestrictedComment(comment: IssueComment): boolean {
  return comment.visibility === 'restricted';
}

/** Commentaires citables : visibilité restreinte exclue, ordre conservé. */
export function citableComments(
  comments: IssueComment[] | undefined | null
): IssueComment[] {
  return (comments ?? []).filter((comment) => !isRestrictedComment(comment));
}
