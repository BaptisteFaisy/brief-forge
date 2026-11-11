import { PermissionDeniedError } from '../../src/util/errors';
import {
  NEIGHBOR_CHANGES_QUERY,
  createTeamworkGraphClient,
  dedupeChanges,
  parseDevStatusChanges,
  parseNeighborChanges,
} from '../../src/collect/teamworkGraphClient';
import type { GraphTransport, HttpResponseLike } from '../../src/collect/types';

function jsonResponse(payload: unknown, status = 200): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

const GRAPH_PAYLOAD = {
  data: {
    teamworkGraph: {
      developmentChanges: {
        nodes: [
          {
            __typename: 'PullRequest',
            title: 'PROJ-8 : export CSV',
            url: 'https://exemple.atlassian.net/pr/1',
            state: 'MERGED',
            createdAt: '2026-03-01T10:00:00.000Z',
            author: { name: 'dana' },
          },
          {
            __typename: 'Commit',
            title: 'fix: en-têtes CSV',
            url: 'https://exemple.atlassian.net/commit/abc',
            createdAt: '2026-02-20T08:00:00.000Z',
            author: { name: 'eli' },
          },
        ],
      },
    },
  },
};

const DEV_STATUS_PAYLOAD = {
  pullRequests: {
    detail: [
      {
        pullRequests: [
          {
            name: 'PROJ-8 : export CSV',
            url: 'https://exemple.atlassian.net/pr/1',
            status: 'MERGED',
            lastUpdate: '2026-03-01T10:00:00.000Z',
            author: { name: 'dana' },
          },
        ],
        repositories: [
          {
            commits: [
              {
                message: 'fix: en-têtes CSV',
                url: 'https://exemple.atlassian.net/commit/abc',
                authorTimestamp: '2026-02-20T08:00:00.000Z',
                author: { name: 'eli' },
              },
            ],
          },
        ],
      },
    ],
  },
  commits: { detail: [] },
};

describe('teamworkGraphClient — analyse du graphe', () => {
  it('extrait pull requests et commits, triés du plus récent au plus ancien', () => {
    const changes = parseNeighborChanges(GRAPH_PAYLOAD);
    expect(changes).toEqual([
      {
        kind: 'pull-request',
        title: 'PROJ-8 : export CSV',
        url: 'https://exemple.atlassian.net/pr/1',
        date: '2026-03-01T10:00:00.000Z',
        author: 'dana',
        state: 'MERGED',
      },
      {
        kind: 'commit',
        title: 'fix: en-têtes CSV',
        url: 'https://exemple.atlassian.net/commit/abc',
        date: '2026-02-20T08:00:00.000Z',
        author: 'eli',
        state: undefined,
      },
    ]);
  });

  it('supporte un schéma différent (conteneur nommé pullRequests)', () => {
    const payload = {
      pullRequests: {
        nodes: [{ title: 'PR sans typename', url: 'https://x/pr/9', createdAt: '2026-01-02' }],
      },
    };
    expect(parseNeighborChanges(payload)[0].kind).toBe('pull-request');
  });

  it('ignore les nœuds sans URL et déduplique', () => {
    const payload = {
      nodes: [
        { title: 'sans url' },
        { title: 'a', url: 'https://x/1', createdAt: '2026-01-01' },
        { title: 'a bis', url: 'https://x/1', createdAt: '2026-01-01' },
      ],
    };
    const changes = parseNeighborChanges(payload);
    expect(changes).toHaveLength(1);
    expect(changes[0].title).toBe('a');
  });

  it('renvoie une liste vide sur une charge inattendue', () => {
    expect(parseNeighborChanges(undefined)).toEqual([]);
    expect(parseNeighborChanges({ data: {} })).toEqual([]);
  });
});

describe('teamworkGraphClient — repli information de développement', () => {
  it('lit les PR et commits du panneau de développement Jira', () => {
    const changes = parseDevStatusChanges(DEV_STATUS_PAYLOAD);
    expect(changes.map((change) => change.kind)).toEqual(['pull-request', 'commit']);
    expect(changes[0].author).toBe('dana');
    expect(changes[1].title).toBe('fix: en-têtes CSV');
  });

  it('tolère une charge vide', () => {
    expect(parseDevStatusChanges({})).toEqual([]);
    expect(parseDevStatusChanges(null)).toEqual([]);
  });

  it('déduplique par URL', () => {
    const changes = dedupeChanges([
      { kind: 'commit', title: 'a', url: 'https://x/1', date: '', author: 'a' },
      { kind: 'commit', title: 'b', url: 'https://x/1', date: '', author: 'b' },
      { kind: 'commit', title: 'c', url: '', date: '', author: 'c' },
    ]);
    expect(changes).toHaveLength(1);
  });
});

describe('teamworkGraphClient — transport', () => {
  it('envoie la requête au nom de l’utilisateur avec les variables attendues', async () => {
    const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
    const graph: GraphTransport = async (query, variables) => {
      calls.push({ query, variables });
      return jsonResponse(GRAPH_PAYLOAD);
    };
    const raw = await createTeamworkGraphClient(graph).fetchNeighborChanges({
      issueKey: 'PROJ-7',
      componentNames: ['api'],
      linkedKeys: ['PROJ-8'],
      since: '2026-03-01T00:00:00.000Z',
    });
    expect(calls[0].query).toBe(NEIGHBOR_CHANGES_QUERY);
    expect(calls[0].variables).toEqual({
      issueKey: 'PROJ-7',
      linkedKeys: ['PROJ-8'],
      componentNames: ['api'],
      since: '2026-03-01T00:00:00.000Z',
    });
    expect(parseNeighborChanges(raw)).toHaveLength(2);
  });

  it('mappe un refus de droits en erreur typée', async () => {
    const graph: GraphTransport = async () => jsonResponse({}, 403);
    await expect(
      createTeamworkGraphClient(graph).fetchNeighborChanges({
        issueKey: 'PROJ-7',
        componentNames: [],
        linkedKeys: [],
        since: '2026-03-01T00:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
