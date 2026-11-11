/** Tests du critère « aucune décision applicable contradictoire » (10 points). */

import { checkContradictoryDecision } from '../../src/readiness/criteria/contradictoryDecisionCheck';
import { makeDecision, makeInput } from './fixtures';

const CACHE_OBLIGATOIRE = makeDecision({
  title: 'Le cache Redis est obligatoire',
  body: 'Toutes les lectures de factures passent par le cache Redis, c’est obligatoire.',
  date: '2026-03-12',
});

const CACHE_SUPPRIME = makeDecision({
  title: 'Supprimer le cache Redis',
  body: 'On supprime le cache Redis, ne pas l’utiliser pour les factures.',
  date: '2026-06-05',
});

describe('checkContradictoryDecision', () => {
  it('accepte un ticket sans décision', () => {
    const outcome = checkContradictoryDecision(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(10);
  });

  it('détecte deux décisions contradictoires et cite les deux', () => {
    const outcome = checkContradictoryDecision(
      makeInput({}, {}, { decisions: [CACHE_OBLIGATOIRE, CACHE_SUPPRIME] })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('se contredisent');
    expect(outcome.reason).toContain('cache');
  });

  it('accepte deux décisions qui parlent de sujets différents', () => {
    const outcome = checkContradictoryDecision(
      makeInput({}, {}, {
        decisions: [
          CACHE_OBLIGATOIRE,
          makeDecision({
            title: 'Nommage des branches',
            body: 'Les branches suivent le format feat/PAY-123-description.',
            date: '2026-04-01',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('accepte une décision explicitement remplacée', () => {
    const outcome = checkContradictoryDecision(
      makeInput({}, {}, {
        decisions: [
          CACHE_OBLIGATOIRE,
          makeDecision({
            title: 'Supprimer le cache Redis',
            body: 'Cette décision remplace la précédente : on supprime le cache Redis des factures.',
            date: '2026-06-05',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('accepte une seule décision, même négative', () => {
    const outcome = checkContradictoryDecision(makeInput({}, {}, { decisions: [CACHE_SUPPRIME] }));

    expect(outcome.passed).toBe(true);
  });
});
