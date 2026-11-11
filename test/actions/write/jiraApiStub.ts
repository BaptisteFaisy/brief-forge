/**
 * Doublure de `@forge/api` pour les tests des outils d'écriture.
 *
 * Usage, en tête de fichier de test :
 *
 *   jest.mock('@forge/api', () => require('./jiraApiStub').buildForgeApiMock());
 *
 * Aucun appel réseau : les requêtes sont enregistrées (`jiraCalls`) et servies
 * par une réponse par défaut, remplaçable au cas par cas (`respondWith`).
 */

/** Un appel Jira capturé. */
export interface StubCall {
  accountId: string;
  method: string;
  path: string;
  body: unknown;
}

/** Réponse servie par la doublure. */
export interface StubResponse {
  ok: boolean;
  status: number;
  data?: unknown;
}

type Responder = (call: StubCall) => StubResponse | undefined;

interface StubState {
  calls: StubCall[];
  responder: Responder | null;
}

const state: StubState = { calls: [], responder: null };

/** Auteur du ticket renvoyé par défaut (mention @). */
export const STUB_REPORTER = { accountId: 'acc-reporter', displayName: 'Camille' };

/** Identifiant du commentaire créé par défaut. */
export const STUB_COMMENT_ID = 'comment-1001';

/** Remet la doublure à zéro entre deux tests. */
export function resetJiraStub(): void {
  state.calls.length = 0;
  state.responder = null;
}

/** Appels Jira reçus, dans l'ordre. */
export function jiraCalls(): StubCall[] {
  return state.calls.map((call) => ({ ...call }));
}

/** Appels correspondant à un fragment de chemin (ex. `'/comment'`). */
export function jiraCallsMatching(fragment: string): StubCall[] {
  return jiraCalls().filter((call) => call.path.includes(fragment));
}

/** Remplace la réponse par défaut ; renvoyer `undefined` retombe sur elle. */
export function respondWith(responder: Responder): void {
  state.responder = responder;
}

/** Refuse un droit Jira précis, comme le ferait `/mypermissions`. */
export function denyPermission(permission: string): void {
  respondWith((call) => {
    if (!call.path.includes('/mypermissions')) return undefined;
    return {
      ok: true,
      status: 200,
      data: {
        permissions: {
          ADD_COMMENTS: { havePermission: permission !== 'ADD_COMMENTS' },
          EDIT_ISSUES: { havePermission: permission !== 'EDIT_ISSUES' },
        },
      },
    };
  });
}

function defaultResponse(call: StubCall): StubResponse {
  const { method, path } = call;
  if (path.includes('/mypermissions')) {
    return {
      ok: true,
      status: 200,
      data: {
        permissions: {
          ADD_COMMENTS: { havePermission: true },
          EDIT_ISSUES: { havePermission: true },
        },
      },
    };
  }
  if (method === 'GET' && path.includes('fields=labels')) {
    return { ok: true, status: 200, data: { fields: { labels: ['existant'] } } };
  }
  if (method === 'GET' && path.includes('fields=summary,reporter,creator')) {
    return {
      ok: true,
      status: 200,
      data: { key: 'PAY-142', fields: { summary: 'Remboursement idempotent', reporter: STUB_REPORTER } },
    };
  }
  if (method === 'GET') {
    return { ok: true, status: 200, data: { key: 'PAY-142', fields: { summary: 'Remboursement idempotent' } } };
  }
  if (method === 'POST' && path.endsWith('/comment')) {
    return {
      ok: true,
      status: 201,
      data: { id: STUB_COMMENT_ID, self: `https://api.example/comment/${STUB_COMMENT_ID}` },
    };
  }
  return { ok: true, status: 200, data: {} };
}

function routeValue(path: unknown): string {
  if (typeof path === 'string') return path;
  const value = (path as { value?: unknown } | null)?.value;
  return typeof value === 'string' ? value : String(path);
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function stubHeaders() {
  return {
    append: () => undefined,
    delete: () => undefined,
    get: () => null,
    has: () => false,
    set: () => undefined,
    forEach: () => undefined,
  };
}

function makeRequest(accountId: string) {
  return async (path: unknown, init?: { method?: string; body?: unknown }) => {
    const call: StubCall = {
      accountId,
      method: (init?.method ?? 'GET').toUpperCase(),
      path: routeValue(path),
      body: parseBody(init?.body),
    };
    state.calls.push(call);
    const response = state.responder?.(call) ?? defaultResponse(call);
    const data = response.data ?? {};
    return {
      ok: response.ok,
      status: response.status,
      statusText: '',
      json: async () => data,
      text: async () => JSON.stringify(data),
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: stubHeaders(),
    };
  };
}

/** Étiquette de route simplifiée : concatène comme le fait `@forge/api`. */
function stubRoute(strings: TemplateStringsArray, ...values: unknown[]) {
  const value = strings.reduce(
    (acc, fragment, index) =>
      acc + fragment + (index < values.length ? String(values[index]) : ''),
    ''
  );
  return { value };
}

/** Module `@forge/api` complet attendu par `jest.mock`. */
export function buildForgeApiMock(): unknown {
  const api = {
    asUser: (accountId: string) => ({ requestJira: makeRequest(accountId) }),
    asApp: () => ({ requestJira: makeRequest('app') }),
  };
  return { __esModule: true, default: api, route: stubRoute };
}
