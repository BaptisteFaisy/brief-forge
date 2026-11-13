/**
 * Régression du 13 novembre 2026 — le chemin `asUser` (BC-09).
 *
 * Constat réel, en MCP externe sur le site de démo : le garde appelait
 * `api.asUser(accountId)`, c'est-à-dire de l'**impersonation hors ligne**.
 * La plateforme Forge la refuse sans scope `allowImpersonation`
 * (`NO_IMPERSONATION_SCOPES_DEFINED`), donc *tout* appel se terminait par
 * « Accès refusé au ticket … pour l'utilisateur appelant » — y compris sur un
 * ticket que l'appelant pouvait lire. Le garde devait utiliser
 * `api.asUser()` **sans argument** : la requête part alors avec le jeton de
 * l'appelant (le contexte MCP externe est déjà un contexte utilisateur).
 *
 * Ces tests mockent `@forge/api` **avant** l'import du module : c'est la
 * seule façon de vérifier quel appel est réellement émis.
 */
const asUser = jest.fn();
const requestJira = jest.fn();

jest.mock('@forge/api', () => ({
  __esModule: true,
  default: { asUser: (...args: unknown[]) => asUser(...args) },
  route: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((acc: string, part: string, index: number) => acc + part + (values[index] ?? ''), ''),
}));

import {
  assertIssueAccess,
  checkIssueAccess,
} from '../../src/security/permissionGuard';
import { PermissionDeniedError } from '../../src/util/errors';

function reponse(status: number) {
  return { ok: status >= 200 && status < 300, status };
}

describe('permissionGuard — la lecture Jira porte le jeton de l’appelant', () => {
  beforeEach(() => {
    asUser.mockReset();
    requestJira.mockReset();
  });

  it('appelle asUser() sans argument — jamais asUser(accountId)', async () => {
    requestJira.mockResolvedValue(reponse(200));
    asUser.mockReturnValue({ requestJira });

    const decision = await checkIssueAccess('ABC-1', 'acc-1');

    expect(decision.verdict).toBe('autorise');
    expect(asUser).toHaveBeenCalledWith();
    expect(asUser).not.toHaveBeenCalledWith('acc-1');
    expect(requestJira).toHaveBeenCalledTimes(1);
  });

  it('refuse quand l’appelant ne peut pas lire le ticket (403)', async () => {
    requestJira.mockResolvedValue(reponse(403));
    asUser.mockReturnValue({ requestJira });

    await expect(assertIssueAccess('ABC-1', 'acc-1')).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuse un ticket inexistant (404) sans dire qu’il existe', async () => {
    requestJira.mockResolvedValue(reponse(404));
    asUser.mockReturnValue({ requestJira });

    await expect(assertIssueAccess('ABC-404', 'acc-1')).rejects.toThrow(/Accès refusé/);
  });

  it('refuse (fail-safe) quand la lecture échoue techniquement', async () => {
    requestJira.mockRejectedValue(new Error('réseau indisponible'));
    asUser.mockReturnValue({ requestJira });

    await expect(assertIssueAccess('ABC-1', 'acc-1')).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
