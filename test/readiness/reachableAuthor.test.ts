/** Tests du critère « auteur ou responsable joignable » (10 points). */

import { checkReachableAuthor } from '../../src/readiness/criteria/reachableAuthorCheck';
import { makeInput } from './fixtures';

describe('checkReachableAuthor', () => {
  it('accepte un rapporteur identifié', () => {
    const outcome = checkReachableAuthor(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(10);
  });

  it('accepte un ticket non assigné mais rapporté par quelqu’un', () => {
    const outcome = checkReachableAuthor(makeInput({ assignee: '' }));

    expect(outcome.passed).toBe(true);
  });

  it('refuse un ticket sans rapporteur ni assigné', () => {
    const outcome = checkReachableAuthor(makeInput({ reporter: '', assignee: '' }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('aucun rapporteur ni assigné');
  });

  it('refuse un compte générique', () => {
    const outcome = checkReachableAuthor(makeInput({ reporter: 'inconnu', assignee: 'n/a' }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('injoignable');
  });

  it('refuse un compte supprimé', () => {
    const outcome = checkReachableAuthor(
      makeInput({ reporter: 'ancien collaborateur (compte supprimé)', assignee: '' })
    );

    expect(outcome.passed).toBe(false);
  });
});
