/** Tests du critère « composant ou zone identifié » (10 points). */

import { checkComponentIdentified } from '../../src/readiness/criteria/componentIdentifiedCheck';
import { makeInput } from './fixtures';

describe('checkComponentIdentified', () => {
  it('accepte un composant Jira', () => {
    const outcome = checkComponentIdentified(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(10);
  });

  it('accepte la zone configurée sur le projet', () => {
    const outcome = checkComponentIdentified(
      makeInput({ components: [] }, { componentZone: 'src/billing' })
    );

    expect(outcome.passed).toBe(true);
  });

  it('accepte une étiquette de composant', () => {
    const outcome = checkComponentIdentified(
      makeInput({ components: [], labels: ['component: paiement'] })
    );

    expect(outcome.passed).toBe(true);
  });

  it('accepte un champ personnalisé qui nomme le module', () => {
    const outcome = checkComponentIdentified(
      makeInput({ components: [], customFields: { 'Module concerné': 'facturation' } })
    );

    expect(outcome.passed).toBe(true);
  });

  it('refuse un ticket sans composant ni zone', () => {
    const outcome = checkComponentIdentified(makeInput({ components: [] }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('aucun composant ni zone identifié');
  });
});
