jest.mock('@forge/react', () => require('./forgeReactMock').forgeReactMock);

import { ScoreBadge, getScoreCategory } from '../../src/ui/components/ScoreBadge';
import { MOCK_READINESS_SCORE } from '../../src/ui/data';
import { findAll, textOf } from './renderTree';

describe('ScoreBadge — score de préparation', () => {
  it('affiche « Préparation : 45 / 100 » et le statut « À préciser »', () => {
    const tree = ScoreBadge({ score: 45 });
    const text = textOf(tree);

    expect(text).toContain('Préparation : 45 / 100');
    expect(text).toContain('À préciser');
  });

  it('rend le score du ticket en français puis en anglais', () => {
    const fr = textOf(ScoreBadge({ score: MOCK_READINESS_SCORE.score, language: 'fr' }));
    const en = textOf(ScoreBadge({ score: MOCK_READINESS_SCORE.score, language: 'en' }));

    expect(fr).toContain('Préparation : 45 / 100');
    expect(en).toContain('Readiness: 45 / 100');
    expect(en).toContain('Needs precision');
  });

  it('applique les seuils 70 / 40 du contrat', () => {
    expect(getScoreCategory(70).statusKey).toBe('statusReady');
    expect(getScoreCategory(69).statusKey).toBe('statusNeedsPrecision');
    expect(getScoreCategory(40).statusKey).toBe('statusNeedsPrecision');
    expect(getScoreCategory(39).statusKey).toBe('statusNotReady');
  });

  it('colore la lozenge de statut selon la catégorie', () => {
    const ready = findAll(ScoreBadge({ score: 85 }), 'Lozenge');
    const notReady = findAll(ScoreBadge({ score: 10 }), 'Lozenge');

    expect(ready[0].appearance).toBe('success');
    expect(ready[0].children).toBe('Prêt');
    expect(notReady[0].appearance).toBe('removed');
    expect(notReady[0].children).toBe('Non prêt');
  });
});
