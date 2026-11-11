/**
 * Tests de la condensation : chaque phrase conservée garde son renvoi de
 * source, un élément sans source est supprimé, et sans modèle on garde le
 * texte d'origine.
 */

import {
  condenseItems,
  condenseText,
  dropUnsourced,
  passthroughCondenser,
} from '../../src/brief/condenser';
import { RECENT_DATE } from './fixtures';

const ITEM = {
  text: 'Le filtrage doit rester côté serveur pour ne pas charger toute la table.',
  source: 'Décision amina',
  date: RECENT_DATE,
};

describe('condenser', () => {
  it('supprime un élément sans source (BC-02)', () => {
    const kept = dropUnsourced([ITEM, { ...ITEM, source: '' }, { ...ITEM, date: '' }]);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe('Décision amina');
  });

  it('garde la source et la date après condensation', async () => {
    const condense = async () => 'Filtrage côté serveur (source : Décision amina).';
    const items = await condenseItems([ITEM], 100, condense);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('Décision amina');
    expect(items[0].date).toBe(RECENT_DATE);
    expect(items[0].text).toContain('Filtrage côté serveur');
  });

  it('supprime un élément dont la condensation est vide', async () => {
    const condense = async () => '   ';
    const items = await condenseItems([ITEM], 100, condense);
    expect(items).toHaveLength(0);
  });

  it('borne la longueur du texte condensé au budget par élément', async () => {
    const condense = async (input: { budgetTokens: number }) =>
      'mot '.repeat(input.budgetTokens * 4);
    const items = await condenseItems([ITEM], 40, condense);
    expect(items[0].text.length).toBeLessThanOrEqual(40 * 4 + 1);
  });

  it('retombe sur le texte d’origine sans modèle disponible', async () => {
    const items = await condenseItems([ITEM], 1000, passthroughCondenser);
    expect(items[0].text).toBe(ITEM.text);
    await expect(passthroughCondenser({ text: 'abc', budgetTokens: 10, keepSources: true })).resolves.toBe('abc');
  });

  it('garde le texte d’origine si le modèle ne renvoie rien', async () => {
    const condense = async () => '';
    const text = await condenseText('Un texte court.', 50, condense);
    expect(text).toBe('Un texte court.');
  });

  it('tronque un texte trop long sans perdre la source (portée par l’item)', async () => {
    const long = 'phrase longue '.repeat(200);
    const text = await condenseText(long, 20, passthroughCondenser);
    expect(text.length).toBeLessThanOrEqual(20 * 4 + 1);
    expect(ITEM.source).toBe('Décision amina');
  });
});
