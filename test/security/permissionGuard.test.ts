/**
 * Contrôle d'accès (BC-09) : on relit le ticket au nom de l'utilisateur
 * appelant ; tout refus est explicite et ne renvoie aucun contenu.
 */
import {
  assertIssueAccess,
  assertIssueAccessFromContext,
  checkIssueAccess,
  classifyAccessResponse,
  isSafeIssueKey,
  resolveCallerAccountId,
} from '../../src/security/permissionGuard';
import { PermissionDeniedError } from '../../src/util/errors';

const OK = { ok: true, status: 200 };

describe('resolveCallerAccountId — identité issue du contexte uniquement', () => {
  it('lit accountId du contexte', () => {
    expect(resolveCallerAccountId({ accountId: 'acc-1' })).toBe('acc-1');
  });

  it('lit principal.accountId', () => {
    expect(resolveCallerAccountId({ principal: { accountId: 'acc-2' } })).toBe('acc-2');
  });

  it('ne lit jamais un payload d’outil', () => {
    const context = { accountId: 'acc-legitime', payload: { accountId: 'acc-admin' } };
    expect(resolveCallerAccountId(context)).toBe('acc-legitime');
  });

  it('rend null sans identité exploitable', () => {
    expect(resolveCallerAccountId(undefined)).toBeNull();
    expect(resolveCallerAccountId({})).toBeNull();
    expect(resolveCallerAccountId({ accountId: '   ' })).toBeNull();
    expect(resolveCallerAccountId('acc-1')).toBeNull();
  });
});

describe('isSafeIssueKey', () => {
  it('accepte une clé Jira normale', () => {
    expect(isSafeIssueKey('ABC-123')).toBe(true);
    expect(isSafeIssueKey('PROJ_2-1')).toBe(true);
  });

  it('refuse une clé qui permettrait d’injecter un chemin', () => {
    expect(isSafeIssueKey('ABC-1/../secret')).toBe(false);
    expect(isSafeIssueKey('../../etc/passwd')).toBe(false);
    expect(isSafeIssueKey('ABC')).toBe(false);
    expect(isSafeIssueKey('')).toBe(false);
  });
});

describe('classifyAccessResponse', () => {
  it('autorise une lecture réussie', () => {
    expect(classifyAccessResponse(OK)).toBe('autorise');
  });

  it('refuse 401, 403 et 404 (pas de divulgation de l’existence)', () => {
    expect(classifyAccessResponse({ ok: false, status: 401 })).toBe('refuse');
    expect(classifyAccessResponse({ ok: false, status: 403 })).toBe('refuse');
    expect(classifyAccessResponse({ ok: false, status: 404 })).toBe('refuse');
  });

  it('reste indéterminé sur une panne serveur', () => {
    expect(classifyAccessResponse({ ok: false, status: 500 })).toBe('indetermine');
    expect(classifyAccessResponse(null)).toBe('indetermine');
  });
});

describe('assertIssueAccess — décisions', () => {
  it('laisse passer quand l’utilisateur peut lire le ticket', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    await expect(
      assertIssueAccess('ABC-1', 'acc-1', { fetchIssue })
    ).resolves.toBeUndefined();
    expect(fetchIssue).toHaveBeenCalledWith('ABC-1', 'acc-1');
  });

  it('refuse un utilisateur sans droit (403)', async () => {
    const fetchIssue = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      assertIssueAccess('ABC-1', 'acc-sans-droit', { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuse un ticket inexistant (404) sans dire qu’il existe', async () => {
    const fetchIssue = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(
      assertIssueAccess('ABC-404', 'acc-1', { fetchIssue })
    ).rejects.toThrow(/Accès refusé/);
  });

  it('refuse quand aucune identité n’est fournie', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    await expect(
      assertIssueAccess('ABC-1', undefined, { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(fetchIssue).not.toHaveBeenCalled();
  });

  it('refuse sans appeler l’API si la clé de ticket est dangereuse', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    await expect(
      assertIssueAccess('ABC-1/../x', 'acc-1', { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(fetchIssue).not.toHaveBeenCalled();
  });

  it('refuse (fail-safe) quand la lecture échoue techniquement', async () => {
    const fetchIssue = jest.fn().mockRejectedValue(new Error('réseau indisponible'));
    await expect(
      assertIssueAccess('ABC-1', 'acc-1', { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('refuse (fail-safe) sur une erreur serveur', async () => {
    const fetchIssue = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      assertIssueAccess('ABC-1', 'acc-1', { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('expose un code d’erreur stable et aucun contenu de ticket', async () => {
    const fetchIssue = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    try {
      await assertIssueAccess('ABC-1', 'acc-1', { fetchIssue });
      fail('un refus était attendu');
    } catch (error) {
      const denied = error as PermissionDeniedError;
      expect(denied.code).toBe('PERMISSION_DENIED');
      expect(denied.message).toContain('ABC-1');
      expect(JSON.stringify(denied.details)).not.toMatch(/contenu|body|description/i);
    }
  });
});

describe('checkIssueAccess', () => {
  it('rend un verdict autorisé sans lever d’erreur', async () => {
    const decision = await checkIssueAccess('ABC-1', 'acc-1', {
      fetchIssue: async () => OK,
    });
    expect(decision.verdict).toBe('autorise');
    expect(decision.issueKey).toBe('ABC-1');
  });

  it('normalise la clé de ticket', async () => {
    const decision = await checkIssueAccess('  ABC-1  ', 'acc-1', {
      fetchIssue: async () => OK,
    });
    expect(decision.issueKey).toBe('ABC-1');
  });
});

describe('assertIssueAccessFromContext — anti-usurpation', () => {
  it('utilise l’identité du contexte', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    await assertIssueAccessFromContext('ABC-1', { accountId: 'acc-contexte' }, { fetchIssue });
    expect(fetchIssue).toHaveBeenCalledWith('ABC-1', 'acc-contexte');
  });

  it('ignore une identité fournie dans les entrées de l’outil', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    const contexteForge = { accountId: 'acc-simple-utilisateur' };
    await assertIssueAccessFromContext('ABC-1', contexteForge, { fetchIssue });
    expect(fetchIssue).toHaveBeenCalledWith('ABC-1', 'acc-simple-utilisateur');
    expect(fetchIssue).not.toHaveBeenCalledWith('ABC-1', 'acc-admin');
  });

  it('refuse un contexte sans identité', async () => {
    const fetchIssue = jest.fn().mockResolvedValue(OK);
    await expect(
      assertIssueAccessFromContext('ABC-1', {}, { fetchIssue })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
