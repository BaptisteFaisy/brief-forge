/**
 * Doublure de la couche de stockage pour les tests des outils d'écriture.
 *
 * Usage, en tête de fichier de test :
 *
 *   jest.mock('../../../src/storage', () => require('./storageStub').buildStorageMock());
 *
 * Seuls les repos réellement touchés par les écritures sont remplacés ; le
 * reste (types, `defaultClaimExpiry`) vient du module réel, ce qui évite de
 * réimplémenter la règle des 4 h dans les tests.
 */

/** Module `src/storage` attendu par `jest.mock`, repos sensibles doublés. */
export function buildStorageMock(): unknown {
  const actual = jest.requireActual<Record<string, unknown>>('../../../src/storage');
  return {
    __esModule: true,
    ...actual,
    logAccess: jest.fn(),
    saveAttempt: jest.fn(),
    hasStaleBrief: jest.fn(),
    loadActiveClaim: jest.fn(),
    saveClaim: jest.fn(),
  };
}

/** Accès typé à une fonction doublée. */
export function mockOf(fn: unknown): jest.Mock {
  return fn as jest.Mock;
}

/** Contexte Forge d'un appel MCP (identité + libellés d'attribution). */
export const AGENT_CONTEXT = {
  accountId: 'acc-agent',
  principal: { accountId: 'acc-agent', displayName: 'Baptiste' },
  clientName: 'claude-code',
  cloudId: 'acme',
};
