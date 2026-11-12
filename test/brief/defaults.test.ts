/**
 * Tests du câblage par défaut des dépendances du brief.
 *
 * Le câblage production charge `@forge/api` et `@forge/sql` : on ne le teste
 * donc pas par un appel réel, mais en vérifiant que le résolveur de
 * dépendances fait le bon choix (injecté vs production).
 */

jest.mock('../../src/llm', () => ({
  createModelCondenser: jest.fn(
    () => async (input: { text: string }) => `condensé:${input.text}`
  ),
}));

import { createModelCondenser } from '../../src/llm';
import { resolveDeps } from '../../src/brief/builder';
import {
  LLM_CONDENSATION_ENV,
  defaultBriefDeps,
  llmCondensationEnabled,
} from '../../src/brief/defaults';

describe('defaultBriefDeps', () => {
  it('expose toutes les dépendances attendues par le contrat', () => {
    const deps = defaultBriefDeps();
    expect(typeof deps.collectIssue).toBe('function');
    expect(typeof deps.collectDecisions).toBe('function');
    expect(typeof deps.collectNeighborChanges).toBe('function');
    expect(typeof deps.readSettings).toBe('function');
    expect(typeof deps.loadAttempts).toBe('function');
    expect(typeof deps.loadLessons).toBe('function');
  });

  it('préfère les dépendances injectées', () => {
    const injected = { collectIssue: jest.fn() };
    expect(resolveDeps(injected)).toBe(injected);
  });

  it('ne branche aucune collecte réelle quand une doublure est injectée', () => {
    const injected = { loadAttempts: jest.fn() };
    const resolved = resolveDeps(injected);
    expect(resolved.collectIssue).toBeUndefined();
    expect(resolved.readSettings).toBeUndefined();
    expect(resolved.loadAttempts).toBe(injected.loadAttempts);
  });

  it('complète par le câblage production quand aucune collecte n’est injectée', () => {
    const resolved = resolveDeps({});
    expect(typeof resolved.collectIssue).toBe('function');
    expect(typeof resolved.readSettings).toBe('function');
  });
});

/**
 * L'API Forge LLMs n'a aucun quota gratuit : chaque jeton est facturé au
 * développeur de l'app. Ces tests verrouillent donc l'interrupteur — le chemin
 * facturé ne peut pas s'allumer tout seul.
 *
 * Le comportement seul ne suffirait pas à le prouver : le condenseur modèle
 * retombe lui aussi sur le texte d'origine en cas d'échec. D'où l'assertion sur
 * `createModelCondenser`, qui distingue « pas d'appel » de « appel en échec ».
 */
describe('condensation par modèle : chemin facturé, éteint par défaut', () => {
  const original = process.env[LLM_CONDENSATION_ENV];

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[LLM_CONDENSATION_ENV];
  });

  afterAll(() => {
    if (original === undefined) delete process.env[LLM_CONDENSATION_ENV];
    else process.env[LLM_CONDENSATION_ENV] = original;
  });

  it('sans variable : texte d’origine rendu, modèle jamais consulté', async () => {
    const condense = defaultBriefDeps().condense!;

    const out = await condense({ text: 'un texte long', budgetTokens: 4, keepSources: true });

    expect(out).toBe('un texte long');
    expect(createModelCondenser).not.toHaveBeenCalled();
  });

  it('BRIEF_LLM_CONDENSATION=1 : le condenseur modèle est branché', async () => {
    process.env[LLM_CONDENSATION_ENV] = '1';

    const condense = defaultBriefDeps().condense!;
    const out = await condense({ text: 'un texte long', budgetTokens: 4, keepSources: true });

    expect(createModelCondenser).toHaveBeenCalledTimes(1);
    expect(out).toBe('condensé:un texte long');
  });

  it('seul « 1 » allume le chemin facturé', () => {
    expect(llmCondensationEnabled({})).toBe(false);
    expect(llmCondensationEnabled({ [LLM_CONDENSATION_ENV]: '0' })).toBe(false);
    expect(llmCondensationEnabled({ [LLM_CONDENSATION_ENV]: 'true' })).toBe(false);
    expect(llmCondensationEnabled({ [LLM_CONDENSATION_ENV]: '' })).toBe(false);
    expect(llmCondensationEnabled({ [LLM_CONDENSATION_ENV]: '1' })).toBe(true);
  });

  it('éteinte, le module LLM n’est pas requis : le chargement paresseux tient', () => {
    defaultBriefDeps();

    expect(createModelCondenser).not.toHaveBeenCalled();
  });
});
