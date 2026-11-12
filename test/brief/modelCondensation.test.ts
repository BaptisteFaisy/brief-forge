/**
 * Condensation branchée sur un modèle factice (lot LLM).
 *
 * Ce que le moteur doit garantir, quel que soit le modèle :
 * - il **condense vraiment** (le texte rendu vient du modèle) ;
 * - chaque élément condensé **garde sa source et sa date** (BC-02) ;
 * - un élément **sans source est supprimé**, jamais repêché ;
 * - un échec du modèle (panne, timeout, réponse vide) **replie sur le texte
 *   d'origine** : on ne perd pas de contenu parce que le modèle est absent.
 *
 * Aucun appel réseau : le client LLM est une doublure.
 */

import { buildBrief } from '../../src/brief/builder';
import { condenseItems } from '../../src/brief/condenser';
import { defaultBriefDeps } from '../../src/brief/defaults';
import { resolveDeps } from '../../src/brief/builder';
import { createModelCondenser } from '../../src/llm/condense';
import type { LlmClient } from '../../src/llm/types';
import { makeFixture } from './fixtures';
import { RECENT_DATE } from './fixtures';

/** Critère long : au budget `s` (80 jetons/élément), la condensation est déclenchée. */
const LONG_CRITERION =
  'Le filtre de date doit accepter deux bornes incluses et renvoyer au plus 250 lignes paginées côté serveur. '.repeat(6);

const CONDENSED = 'Deux bornes incluses, 250 lignes au plus, filtrage côté serveur.';

function fakeClient(answer: string | null): LlmClient {
  return {
    async list() {
      return { models: [] };
    },
    async chat() {
      throw new Error('non utilisé');
    },
    async complete() {
      return answer;
    },
  };
}

function fixtureWithLongCriterion() {
  return makeFixture({ issue: { acceptanceCriteria: [LONG_CRITERION] } });
}

describe('condensation par modèle dans le brief', () => {
  it('condense réellement et garde la source et la date de l’élément', async () => {
    const fixture = fixtureWithLongCriterion();
    const deps = { ...fixture.deps, condense: createModelCondenser({ client: fakeClient(CONDENSED) }) };
    const brief = await buildBrief('TST-101', 's', deps);

    expect(brief.acceptanceCriteria).toHaveLength(1);
    expect(brief.acceptanceCriteria[0].text).toBe(CONDENSED);
    expect(brief.acceptanceCriteria[0].source).toBe('Jira TST-101');
    expect(brief.acceptanceCriteria[0].date).toBe(RECENT_DATE);
    expect(brief.markdown).toContain(CONDENSED);
    expect(brief.markdown).not.toContain('250 lignes paginées côté serveur. Le filtre');
  });

  it('replie sur le texte d’origine quand le modèle échoue', async () => {
    const fixture = fixtureWithLongCriterion();
    const deps = { ...fixture.deps, condense: createModelCondenser({ client: fakeClient(null) }) };
    const brief = await buildBrief('TST-101', 's', deps);

    expect(brief.acceptanceCriteria).toHaveLength(1);
    expect(brief.acceptanceCriteria[0].text).toContain('Le filtre de date doit accepter deux bornes');
    expect(brief.acceptanceCriteria[0].source).toBe('Jira TST-101');
    // Le repli reste borné par le budget : la troncature s'applique quand même.
    expect(brief.acceptanceCriteria[0].text.length).toBeLessThanOrEqual(80 * 4 + 1);
  });

  it('ne repêche pas une réponse non rattachable au contenu fourni', async () => {
    const fixture = fixtureWithLongCriterion();
    const offTopic = fakeClient('Voici une réponse totalement hors sujet, sans rapport.');
    const deps = { ...fixture.deps, condense: createModelCondenser({ client: offTopic }) };
    const brief = await buildBrief('TST-101', 's', deps);

    expect(brief.markdown).not.toContain('hors sujet');
    expect(brief.acceptanceCriteria[0].text).toContain('Le filtre de date doit accepter');
  });

  it('ne touche pas un élément qui tient déjà dans le budget', async () => {
    const fixture = makeFixture();
    const deps = { ...fixture.deps, condense: createModelCondenser({ client: fakeClient(CONDENSED) }) };
    const brief = await buildBrief('TST-101', 'l', deps);
    expect(brief.acceptanceCriteria[0].text).toBe('Le filtre accepte deux bornes de date incluses.');
    expect(brief.markdown).not.toContain(CONDENSED);
  });
});

describe('condenseur multi-éléments', () => {
  const SOURCED = { text: LONG_CRITERION.trim(), source: 'Jira TST-101', date: RECENT_DATE };

  it('supprime un élément sans source avant même d’appeler le modèle', async () => {
    const client = fakeClient(CONDENSED);
    const items = await condenseItems(
      [SOURCED, { ...SOURCED, source: '' }, { ...SOURCED, date: '' }],
      400,
      createModelCondenser({ client })
    );
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('Jira TST-101');
    expect(items[0].date).toBe(RECENT_DATE);
  });

  it('jette un élément dont la sortie du modèle n’est rattachable à aucune source', async () => {
    const offTopic = fakeClient('Réponse inventée sans aucun lien avec le ticket.');
    const items = await condenseItems([SOURCED], 400, createModelCondenser({ client: offTopic }));
    expect(items).toHaveLength(0);
  });

  it('conserve plusieurs phrases condensées sous la source de l’élément', async () => {
    const twoSentences = fakeClient('Bornes incluses.\n250 lignes au plus, côté serveur.');
    const items = await condenseItems([SOURCED], 400, createModelCondenser({ client: twoSentences }));
    expect(items).toHaveLength(1);
    expect(items[0].text.split('\n')).toHaveLength(2);
    expect(items[0].source).toBe('Jira TST-101');
  });
});

describe('câblage de production', () => {
  it('fournit un condenseur dans les dépendances par défaut', () => {
    expect(typeof defaultBriefDeps().condense).toBe('function');
    expect(typeof resolveDeps({}).condense).toBe('function');
  });

  it('ne lève jamais hors runtime Forge : le texte d’origine est rendu', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const condense = defaultBriefDeps().condense;
    if (!condense) throw new Error('condenseur de production absent');
    await expect(
      condense({ text: 'Texte du ticket à condenser.', budgetTokens: 8, keepSources: true })
    ).resolves.toBe('Texte du ticket à condenser.');
    jest.restoreAllMocks();
  });

  it('laisse le repli passthrough quand des doublures sont injectées', async () => {
    const resolved = resolveDeps({ loadAttempts: async () => [] });
    expect(resolved.condense).toBeUndefined();
  });
});
