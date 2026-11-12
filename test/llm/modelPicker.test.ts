/**
 * Choix du modèle de condensation : actif seulement, le plus économique
 * d'abord, choix mis en cache, repli déterministe si `list()` échoue.
 */

import {
  FALLBACK_MODEL,
  activeModels,
  compareModels,
  isPreferredFamily,
  modelRank,
  pickModel,
  resetModelCache,
  resolveModel,
} from '../../src/llm/modelPicker';
import type { LlmModelInfo, LlmPort } from '../../src/llm/types';

function model(name: string, status: 'active' | 'deprecated' = 'active'): LlmModelInfo {
  return { model: name, status };
}

/** Port factice : compte les appels à `list()`, ne touche jamais le réseau. */
function fakePort(models: LlmModelInfo[] | Error): LlmPort & { listCalls: number } {
  const port = {
    listCalls: 0,
    async list() {
      port.listCalls += 1;
      if (models instanceof Error) throw models;
      return { models };
    },
    async chat() {
      throw new Error('non utilisé dans ce test');
    },
  };
  return port;
}

describe('choix du modèle', () => {
  beforeEach(() => resetModelCache());

  it('classe du plus économique au plus lourd', () => {
    expect(modelRank('claude-haiku-4-5')).toBe(0);
    expect(modelRank('claude-sonnet-5')).toBe(1);
    expect(modelRank('claude-opus-4-8')).toBe(2);
    expect(compareModels(model('claude-opus-4-8'), model('claude-haiku-4-5'))).toBeGreaterThan(0);
  });

  it('préfère la famille déclarée au manifeste', () => {
    expect(isPreferredFamily('claude-haiku-4-5')).toBe(true);
    expect(isPreferredFamily('gpt-4o-mini')).toBe(false);
    expect(pickModel([model('gpt-4o-mini'), model('claude-haiku-4-5')])).toBe('claude-haiku-4-5');
  });

  it('écarte les modèles dépréciés', () => {
    const kept = activeModels([model('claude-haiku-3', 'deprecated'), model('claude-sonnet-5')]);
    expect(kept.map((entry) => entry.model)).toEqual(['claude-sonnet-5']);
  });

  it('rend null quand aucun modèle actif n’est proposé', () => {
    expect(pickModel([])).toBeNull();
    expect(pickModel(undefined)).toBeNull();
    expect(pickModel([model('claude-haiku-3', 'deprecated')])).toBeNull();
  });

  it('ignore une entrée sans nom de modèle', () => {
    const broken = [{ model: '', status: 'active' }, { status: 'active' }] as unknown as LlmModelInfo[];
    expect(pickModel(broken)).toBeNull();
  });

  it('trie de façon déterministe à rang égal', () => {
    const listed = [model('claude-sonnet-5'), model('claude-sonnet-4-5')];
    expect(pickModel(listed)).toBe('claude-sonnet-4-5');
    expect(pickModel(listed.slice().reverse())).toBe('claude-sonnet-4-5');
  });
});

describe('résolution avec cache et repli', () => {
  beforeEach(() => resetModelCache());

  it('met le choix en cache : list() n’est appelé qu’une fois', async () => {
    const port = fakePort([model('claude-haiku-4-5'), model('claude-opus-4-8')]);
    expect(await resolveModel(port)).toBe('claude-haiku-4-5');
    expect(await resolveModel(port)).toBe('claude-haiku-4-5');
    expect(port.listCalls).toBe(1);
  });

  it('retombe sur un modèle déterministe si list() échoue', async () => {
    const port = fakePort(new Error('runtime indisponible'));
    expect(await resolveModel(port)).toBe(FALLBACK_MODEL);
    expect(port.listCalls).toBe(1);
  });

  it('retombe sur le même modèle quand la liste est vide', async () => {
    expect(await resolveModel(fakePort([]))).toBe(FALLBACK_MODEL);
  });

  it('accepte un repli personnalisé', async () => {
    const port = fakePort(new Error('panne'));
    expect(await resolveModel(port, { fallback: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
  });
});
