import { IssueNotFoundError, PermissionDeniedError } from '../../src/util/errors';
import {
  asRecord,
  asString,
  defaultProjectSettings,
  dig,
  extractAcceptanceCriteria,
  httpErrorFor,
  isoDaysAgo,
  matchesCriteriaFieldName,
  parseIsoDate,
  requestJson,
  stringifyFieldValue,
} from '../../src/collect/settingsDefaults';
import type { HttpResponseLike, Transport } from '../../src/collect/types';

function jsonResponse(payload: unknown, status = 200): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('settingsDefaults — réglages par défaut', () => {
  it('fournit un statut déclencheur et les étiquettes de décision', () => {
    const settings = defaultProjectSettings('PROJ');
    expect(settings).toEqual({
      projectId: 'PROJ',
      projectKey: 'PROJ',
      triggerStatus: 'Prêt à développer',
      decisionLabels: ['decision', 'adr'],
    });
  });

  it('accepte un identifiant de projet distinct de la clé', () => {
    expect(defaultProjectSettings('PROJ', '10001').projectId).toBe('10001');
  });

  it('renvoie une copie : muter le résultat ne pollue pas les défauts', () => {
    const first = defaultProjectSettings('PROJ');
    first.decisionLabels.push('pollution');
    expect(defaultProjectSettings('PROJ').decisionLabels).toEqual(['decision', 'adr']);
  });
});

describe('settingsDefaults — helpers de forme', () => {
  it('normalise les valeurs non conformes', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asString(42)).toBe('42');
    expect(asString(undefined)).toBe('');
  });

  it('lit une propriété imbriquée sans jeter', () => {
    const payload = { fields: { status: { name: 'Done' } } };
    expect(dig(payload, 'fields', 'status', 'name')).toBe('Done');
    expect(dig(payload, 'fields', 'absent', 'name')).toBeUndefined();
  });

  it('rend les champs Jira sous forme de texte', () => {
    expect(stringifyFieldValue('texte')).toBe('texte');
    expect(stringifyFieldValue([{ value: 'a' }, { value: 'b' }])).toBe('a, b');
    expect(stringifyFieldValue({ displayName: 'Alice' })).toBe('Alice');
    expect(stringifyFieldValue(null)).toBe('');
  });
});

describe('settingsDefaults — dates', () => {
  it('normalise en ISO et rejette les valeurs invalides', () => {
    expect(parseIsoDate('2026-03-01T10:00:00.000Z')).toBe('2026-03-01T10:00:00.000Z');
    expect(parseIsoDate('pas une date')).toBe('');
    expect(parseIsoDate(undefined)).toBe('');
  });

  it('calcule une date passée', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(isoDaysAgo(90, now)).toBe('2026-03-03T00:00:00.000Z');
  });
});

describe('settingsDefaults — critères d’acceptation', () => {
  it('extrait les items d’une section dédiée', () => {
    const text = [
      'Contexte du ticket.',
      '',
      "Critères d'acceptation :",
      '- export CSV avec en-têtes',
      '- 1 000 lignes en moins de 2 s',
      '',
      'Notes diverses.',
    ].join('\n');
    expect(extractAcceptanceCriteria(text)).toEqual([
      'export CSV avec en-têtes',
      '1 000 lignes en moins de 2 s',
    ]);
  });

  it('s’arrête sur un nouveau titre', () => {
    const text = ['Acceptance criteria:', '- premier', '## Détails', '- hors périmètre'].join('\n');
    expect(extractAcceptanceCriteria(text)).toEqual(['premier']);
  });

  it('replie sur les items de liste et les blocs Given-When-Then', () => {
    const text = ['Given un utilisateur', 'When il exporte', '- résultat daté'].join('\n');
    expect(extractAcceptanceCriteria(text)).toEqual([
      'Given un utilisateur',
      'When il exporte',
      'résultat daté',
    ]);
  });

  it('respecte la borne max et renvoie une liste vide sans contenu', () => {
    const text = ['- a', '- b', '- c'].join('\n');
    expect(extractAcceptanceCriteria(text, 2)).toEqual(['a', 'b']);
    expect(extractAcceptanceCriteria('')).toEqual([]);
  });

  it('reconnaît les noms de champs portant les critères', () => {
    expect(matchesCriteriaFieldName('Acceptance Criteria')).toBe(true);
    expect(matchesCriteriaFieldName("Critères d'acceptation")).toBe(true);
    expect(matchesCriteriaFieldName('Story Points')).toBe(false);
  });
});

describe('settingsDefaults — HTTP typé', () => {
  it('mappe les statuts en erreurs typées', () => {
    expect(httpErrorFor(403, 'PROJ-1')).toBeInstanceOf(PermissionDeniedError);
    expect(httpErrorFor(401, 'PROJ-1')).toBeInstanceOf(PermissionDeniedError);
    expect(httpErrorFor(404, 'PROJ-1')).toBeInstanceOf(IssueNotFoundError);
    expect(httpErrorFor(500, 'PROJ-1').name).toBe('BriefError');
  });

  it('lit le JSON via le transport injecté', async () => {
    const paths: string[] = [];
    const transport: Transport = async (path) => {
      paths.push(path);
      return jsonResponse({ key: 'PROJ-1' });
    };
    await expect(requestJson(transport, '/rest/api/2/issue/PROJ-1', 'PROJ-1')).resolves.toEqual({
      key: 'PROJ-1',
    });
    expect(paths).toEqual(['/rest/api/2/issue/PROJ-1']);
  });

  it('lève une erreur typée sur réponse non 2xx', async () => {
    const transport: Transport = async () => jsonResponse({}, 403);
    await expect(requestJson(transport, '/x', 'PROJ-1')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });
});
