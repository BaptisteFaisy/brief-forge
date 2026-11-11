/**
 * Client Teamwork Graph : changements voisins (pull requests, commits) sur les
 * tickets liés ou le même composant, lus au nom de l'utilisateur appelant.
 *
 * Une app Forge Jira ne peut pas appeler l'API Bitbucket : la source est donc
 * le Teamwork Graph, avec repli sur l'information de développement Jira
 * (`parseDevStatusChanges`). L'analyse du graphe est volontairement tolérante
 * aux variations de schéma : on parcourt la réponse et on retient les nœuds qui
 * portent une URL et un intitulé. Si le schéma serveur rejette la requête
 * (400/404), `collectNeighborChanges` bascule sur l'information de développement
 * Jira : aucune collecte ne dépend donc de la forme exacte de la réponse.
 */

import {
  asArray,
  asRecord,
  asString,
  dig,
  httpErrorFor,
  parseIsoDate,
} from './settingsDefaults';
import type {
  GraphTransport,
  NeighborChange,
  NeighborQueryInput,
  TeamworkGraphClient,
} from './types';

export const NEIGHBOR_WINDOW_DAYS = 90;

const MAX_DEPTH = 8;

export const NEIGHBOR_CHANGES_QUERY = `query NeighborChanges(
  $issueKey: String!
  $linkedKeys: [String!]
  $componentNames: [String!]
  $since: DateTime
) {
  teamworkGraph {
    developmentChanges(
      issueKey: $issueKey
      linkedIssueKeys: $linkedKeys
      componentNames: $componentNames
      since: $since
    ) {
      nodes {
        __typename
        title
        url
        state
        createdAt
        author { name }
      }
    }
  }
}`;

export function createTeamworkGraphClient(
  graph: GraphTransport
): TeamworkGraphClient {
  return {
    fetchNeighborChanges: async (input: NeighborQueryInput) => {
      const response = await graph(NEIGHBOR_CHANGES_QUERY, {
        issueKey: input.issueKey,
        linkedKeys: input.linkedKeys,
        componentNames: input.componentNames,
        since: input.since,
      });
      if (!response.ok) throw httpErrorFor(response.status, input.issueKey);
      return response.json();
    },
  };
}

interface ChangeNode {
  node: Record<string, unknown>;
  path: string[];
}

/** Extrait les changements d'une réponse GraphQL, quel que soit son emboîtement. */
export function parseNeighborChanges(raw: unknown): NeighborChange[] {
  const nodes: ChangeNode[] = [];
  collectChangeNodes(raw, [], nodes);
  return dedupeChanges(nodes.map(toNeighborChange));
}

function collectChangeNodes(
  value: unknown,
  path: string[],
  out: ChangeNode[],
  depth = 0
): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const item of value) collectChangeNodes(item, path, out, depth + 1);
    return;
  }
  const record = asRecord(value);
  const entries = Object.entries(record);
  if (entries.length === 0) return;
  if (isChangeNode(record)) {
    out.push({ node: record, path });
    return;
  }
  for (const [key, child] of entries) {
    collectChangeNodes(child, [...path, key], out, depth + 1);
  }
}

function isChangeNode(node: Record<string, unknown>): boolean {
  const hasUrl = asString(node.url) !== '';
  const hasLabel =
    asString(node.title) !== '' ||
    asString(node.message) !== '' ||
    asString(node.name) !== '';
  return hasUrl && hasLabel;
}

/**
 * Détermine la nature du changement : le type GraphQL (`__typename`) ou le nom
 * du conteneur font foi, l'état (`MERGED`, `OPEN`…) sert de dernier indice.
 */
function changeKind(
  node: Record<string, unknown>,
  path: string[]
): NeighborChange['kind'] {
  const markers = [asString(node.__typename), ...path].join(' ');
  if (/pullrequest|pull_request|merge_request/i.test(markers)) return 'pull-request';
  return asString(node.state) !== '' ? 'pull-request' : 'commit';
}

function toNeighborChange(entry: ChangeNode): NeighborChange {
  const { node, path } = entry;
  return {
    kind: changeKind(node, path),
    title:
      asString(node.title) || asString(node.message) || asString(node.name) || 'changement',
    url: asString(node.url),
    date: parseIsoDate(
      node.createdAt ?? node.updatedAt ?? node.committedAt ?? node.date
    ),
    author:
      asString(dig(node, 'author', 'name')) ||
      asString(dig(node, 'author', 'displayName')) ||
      asString(node.author) ||
      'inconnu',
    state: asString(node.state) || asString(node.status) || undefined,
  };
}

/** Repli : information de développement Jira (PR + commits du même composant). */
export function parseDevStatusChanges(raw: unknown): NeighborChange[] {
  const changes: NeighborChange[] = [];
  for (const detail of asArray(dig(raw, 'pullRequests', 'detail'))) {
    const record = asRecord(detail);
    for (const pr of asArray(record.pullRequests)) {
      changes.push(devPullRequest(pr));
    }
    for (const repository of asArray(record.repositories)) {
      for (const commit of asArray(asRecord(repository).commits)) {
        changes.push(devCommit(commit));
      }
    }
  }
  return dedupeChanges(changes);
}

function devPullRequest(value: unknown): NeighborChange {
  const pr = asRecord(value);
  return {
    kind: 'pull-request',
    title: asString(pr.name) || asString(pr.title) || 'pull request',
    url: asString(pr.url),
    date: parseIsoDate(pr.lastUpdate ?? pr.created),
    author: asString(dig(pr, 'author', 'name')) || 'inconnu',
    state: asString(pr.status) || undefined,
  };
}

function devCommit(value: unknown): NeighborChange {
  const commit = asRecord(value);
  return {
    kind: 'commit',
    title: asString(commit.message) || 'commit',
    url: asString(commit.url),
    date: parseIsoDate(commit.authorTimestamp ?? commit.created),
    author:
      asString(dig(commit, 'author', 'name')) ||
      asString(dig(commit, 'author', 'displayName')) ||
      'inconnu',
  };
}

/** Déduplique par URL et ne conserve que les changements datés et sourcés. */
export function dedupeChanges(changes: NeighborChange[]): NeighborChange[] {
  const seen = new Set<string>();
  const result: NeighborChange[] = [];
  for (const change of changes) {
    if (change.url === '' || seen.has(change.url)) continue;
    seen.add(change.url);
    result.push(change);
  }
  return result.sort((left, right) => right.date.localeCompare(left.date));
}
