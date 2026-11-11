/** Tests des helpers partagés de la couche stockage. */

import { BriefError } from '../../src/util/errors';
import {
  buildSelect,
  buildUpsert,
  fromDbBool,
  fromJson,
  isExpired,
  newId,
  nowIso,
  projectKeyFromIssueKey,
  toDbBool,
  toIso,
  toJson,
  withDbError,
} from '../../src/storage/helpers';

describe('identifiants et dates', () => {
  it('génère des UUID de 36 caractères, uniques', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toHaveLength(36);
  });

  it('normalise les dates en ISO 8601', () => {
    expect(toIso('2026-11-11T09:00:00Z')).toBe('2026-11-11T09:00:00.000Z');
    expect(toIso(new Date('2026-11-11T09:00:00Z'))).toBe('2026-11-11T09:00:00.000Z');
    expect(toIso('pas une date')).toBe('pas une date');
  });

  it('horodate en ISO', () => {
    expect(nowIso(new Date('2026-11-11T09:00:00Z'))).toBe('2026-11-11T09:00:00.000Z');
  });

  it('détecte une échéance passée, et traite l’illisible comme expirée', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(isExpired('2026-11-11T11:59:59Z', now)).toBe(true);
    expect(isExpired('2026-11-11T12:00:00Z', now)).toBe(true);
    expect(isExpired('2026-11-11T12:00:01Z', now)).toBe(false);
    expect(isExpired('illisible', now)).toBe(true);
  });

  it('déduit la clé projet d’une clé de ticket', () => {
    expect(projectKeyFromIssueKey('PAY-142')).toBe('PAY');
    expect(projectKeyFromIssueKey('MY-PROJ-7')).toBe('MY-PROJ');
    expect(projectKeyFromIssueKey('PAY')).toBe('PAY');
  });
});

describe('conversions', () => {
  it('convertit les booléens TINYINT dans les deux sens', () => {
    expect(fromDbBool(1)).toBe(true);
    expect(fromDbBool(0)).toBe(false);
    expect(fromDbBool(true)).toBe(true);
    expect(fromDbBool(null)).toBe(false);
    expect(toDbBool(true)).toBe(1);
    expect(toDbBool(false)).toBe(0);
  });

  it('sérialise et désérialise le JSON des colonnes', () => {
    expect(toJson({ a: 1 })).toBe('{"a":1}');
    expect(toJson(undefined)).toBe('');
    expect(fromJson('[1,2]', [])).toEqual([1, 2]);
    expect(fromJson('{invalide', [])).toEqual([]);
    expect(fromJson(null, 'repli')).toBe('repli');
  });
});

describe('construction de requêtes', () => {
  it('construit un upsert sans réécrire la clé primaire', () => {
    const sql = buildUpsert('brief', ['issue_key', 'budget', 'content_md'], ['issue_key', 'budget']);
    expect(sql).toBe(
      'INSERT INTO brief (issue_key, budget, content_md) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content_md = VALUES(content_md)'
    );
  });

  it('omet la clause de mise à jour si toutes les colonnes sont clés', () => {
    const sql = buildUpsert('claim', ['issue_key', 'agent_name'], ['issue_key', 'agent_name']);
    expect(sql).not.toContain('ON DUPLICATE KEY');
  });

  it('construit un SELECT paramétré et trié', () => {
    expect(buildSelect('attempt', ['issue_key'])).toBe('SELECT * FROM attempt WHERE issue_key = ?');
    expect(buildSelect('attempt', ['issue_key', 'status'], { column: 'started_at', direction: 'DESC' })).toBe(
      'SELECT * FROM attempt WHERE issue_key = ? AND status = ? ORDER BY started_at DESC'
    );
    expect(buildSelect('lesson', [])).toBe('SELECT * FROM lesson');
  });
});

describe('withDbError', () => {
  it('laisse passer la valeur en cas de succès', async () => {
    await expect(withDbError('test', async () => 42)).resolves.toBe(42);
  });

  it('enveloppe une erreur technique en BriefError INTERNAL_ERROR', async () => {
    const failing = () => withDbError('saveBrief', async () => {
      throw new Error('connexion perdue');
    });

    await expect(failing()).rejects.toBeInstanceOf(BriefError);
    await expect(failing()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(failing()).rejects.toThrow(/saveBrief/);
  });

  it('ne réenveloppe pas une BriefError déjà typée', async () => {
    const original = new BriefError('PERMISSION_DENIED', 'refus');
    await expect(
      withDbError('test', async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });
});
