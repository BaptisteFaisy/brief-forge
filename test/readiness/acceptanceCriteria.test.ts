/** Tests du critère « critères d'acceptation vérifiables » (30 points). */

import { checkAcceptanceCriteria } from '../../src/readiness/criteria/acceptanceCriteriaCheck';
import { makeInput } from './fixtures';

describe('checkAcceptanceCriteria', () => {
  it('accepte des critères écrits dans la description', () => {
    const outcome = checkAcceptanceCriteria(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(30);
    expect(outcome.maxPoints).toBe(30);
    expect(outcome.reason).toBeUndefined();
  });

  it('accepte des critères portés par le champ du ticket', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput({
        description: 'Objectif : corriger le total de la facture.',
        acceptanceCriteria: [
          'Le total affiché inclut la TVA à 20 %.',
          'Un total négatif est refusé avec un message d’erreur.',
        ],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('accepte des critères portés par le champ personnalisé configuré', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput(
        {
          description: 'Objectif : corriger le total de la facture.',
          customFields: {
            customfield_10101: [
              'Le total affiche 2 décimales.',
              'Un total négatif est refusé avec un message d’erreur.',
            ].join('\n'),
          },
        },
        { acceptanceCriteriaField: 'customfield_10101' }
      )
    );

    expect(outcome.passed).toBe(true);
  });

  it('refuse un ticket sans aucun critère et le dit', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput({ description: 'Objectif : corriger le total de la facture.', acceptanceCriteria: [] })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.points).toBe(0);
    expect(outcome.reason).toContain('aucun critère d’acceptation');
  });

  it('refuse des critères présents mais invérifiables', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput({
        description: 'Objectif : corriger le total de la facture.',
        acceptanceCriteria: ['Améliorer la page', 'Rendre plus propre'],
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('aucun n’est vérifiable');
  });

  it('refuse un seul critère vérifiable', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput({
        description: 'Objectif : corriger le total de la facture.',
        acceptanceCriteria: ['Le bouton Export renvoie un fichier CSV.'],
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('un seul critère vérifiable');
  });

  it('lit les cases à cocher de la description', () => {
    const outcome = checkAcceptanceCriteria(
      makeInput({
        description: [
          'Objectif : exporter les factures en CSV.',
          '- [ ] Le bouton Export renvoie un fichier CSV.',
          '- [ ] Le fichier contient 3 colonnes : numero, date, montant.',
        ].join('\n'),
        acceptanceCriteria: [],
      })
    );

    expect(outcome.passed).toBe(true);
  });
});
