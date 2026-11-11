/** Tests du critère « périmètre borné » (15 points). */

import { checkScopeBounded } from '../../src/readiness/criteria/scopeBoundedCheck';
import { makeInput } from './fixtures';

describe('checkScopeBounded', () => {
  it('accepte un ticket d’un seul objectif, un seul composant', () => {
    const outcome = checkScopeBounded(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(15);
  });

  it('refuse une description absente : le périmètre n’est pas écrit', () => {
    const outcome = checkScopeBounded(makeInput({ description: '' }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('description absente');
  });

  it('refuse un épique', () => {
    const outcome = checkScopeBounded(makeInput({ issueType: 'Epic' }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('épique');
  });

  it('refuse une formulation de refonte globale', () => {
    const outcome = checkScopeBounded(makeInput({ summary: 'Refonte complète de la facturation' }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('périmètre large');
  });

  it('refuse un ticket qui touche plusieurs composants', () => {
    const outcome = checkScopeBounded(makeInput({ components: ['Facturation', 'Paiement'] }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('2 composants');
  });

  it('refuse trois objectifs annoncés dans le résumé', () => {
    const outcome = checkScopeBounded(
      makeInput({ summary: 'Corriger le total et ajouter le filtre date et exporter le PDF' })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('objectifs');
  });

  it('accepte deux objectifs proches', () => {
    const outcome = checkScopeBounded(
      makeInput({ summary: 'Exporter les factures en CSV et filtrer par date' })
    );

    expect(outcome.passed).toBe(true);
  });

  it('refuse une description démesurée', () => {
    const outcome = checkScopeBounded(makeInput({ description: `Objectif : ${'mot '.repeat(601)}` }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('mots');
  });

  it('refuse un ticket à plus de dix critères d’acceptation', () => {
    const outcome = checkScopeBounded(
      makeInput({
        acceptanceCriteria: Array.from({ length: 11 }, (_, index) => `Le cas ${index} renvoie 1 résultat.`),
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('11 critères');
  });
});
