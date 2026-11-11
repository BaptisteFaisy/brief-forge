/** Tests du critère « aucun lien bloquant ouvert » (15 points). */

import { checkBlockingLink } from '../../src/readiness/criteria/blockingLinkCheck';
import { makeInput } from './fixtures';

describe('checkBlockingLink', () => {
  it('accepte un ticket sans lien', () => {
    const outcome = checkBlockingLink(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(15);
  });

  it('refuse un lien bloquant ouvert et nomme le ticket', () => {
    const outcome = checkBlockingLink(
      makeInput({
        links: [{ type: 'is blocked by', key: 'PAY-90', direction: 'inward', status: 'En cours' }],
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('PAY-90');
    expect(outcome.reason).toContain('En cours');
  });

  it('accepte un lien bloquant terminé', () => {
    const outcome = checkBlockingLink(
      makeInput({
        links: [{ type: 'is blocked by', key: 'PAY-90', direction: 'inward', status: 'Terminé' }],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('traite un statut inconnu comme ouvert, par prudence', () => {
    const outcome = checkBlockingLink(
      makeInput({ links: [{ type: 'dépend de', key: 'PAY-91', direction: 'outward' }] })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('statut inconnu');
  });

  it('ignore un lien non bloquant, même ouvert', () => {
    const outcome = checkBlockingLink(
      makeInput({ links: [{ type: 'relates to', key: 'PAY-92', direction: 'outward', status: 'À faire' }] })
    );

    expect(outcome.passed).toBe(true);
  });

  it('résume plusieurs blocages sans noyer le lecteur', () => {
    const links = ['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4'].map((key) => ({
      type: 'blocks',
      key,
      direction: 'outward' as const,
      status: 'Ouvert',
    }));
    const outcome = checkBlockingLink(makeInput({ links }));

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('4 lien(s) bloquant(s)');
    expect(outcome.reason).toContain('et 1 autre(s)');
  });
});
