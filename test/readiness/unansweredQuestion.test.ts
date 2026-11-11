/** Tests du critère « aucune question sans réponse » (10 points). */

import { checkUnansweredQuestion } from '../../src/readiness/criteria/unansweredQuestionCheck';
import { makeComment, makeInput } from './fixtures';

describe('checkUnansweredQuestion', () => {
  it('accepte un ticket sans commentaire', () => {
    const outcome = checkUnansweredQuestion(makeInput());

    expect(outcome.passed).toBe(true);
    expect(outcome.points).toBe(10);
  });

  it('refuse une question restée sans réponse', () => {
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [makeComment({ body: 'Quel format de date attend-on dans le CSV ?' })],
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('1 question(s) sans réponse');
    expect(outcome.reason).toContain('Quel format de date');
  });

  it('accepte une question suivie d’une réponse d’un autre auteur', () => {
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [
          makeComment({ id: 'c1', author: 'claire.martin', body: 'Quel format de date attend-on ?' }),
          makeComment({
            id: 'c2',
            author: 'sam.bernard',
            createdAt: '2026-10-03T09:00:00.000Z',
            body: 'Format ISO 8601, comme le reste de l’export.',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('refuse une question suivie d’un commentaire du même auteur seulement', () => {
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [
          makeComment({ id: 'c1', body: 'Quel format de date attend-on ?' }),
          makeComment({
            id: 'c2',
            createdAt: '2026-10-03T09:00:00.000Z',
            body: 'Je relance, la question est toujours ouverte pour moi.',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(false);
  });

  it('ignore les citations qui ne posent pas de question', () => {
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [makeComment({ body: '> Question précédente : quel format ?\n\nRéponse : ISO.' })],
      })
    );

    expect(outcome.passed).toBe(true);
  });

  it('ignore une question posée en visibilité restreinte', () => {
    // Un commentaire restreint n'alimente pas le score : il est exclu du brief.
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [
          makeComment({
            body: 'Quel taux de TVA appliquer sur ce client ?',
            visibility: 'restricted',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(true);
    expect(outcome.reason).toBeUndefined();
  });

  it('ne compte pas une réponse en visibilité restreinte comme une réponse', () => {
    const outcome = checkUnansweredQuestion(
      makeInput({}, {}, {
        comments: [
          makeComment({ id: 'c1', body: 'Quel format de date attend-on dans le CSV ?' }),
          makeComment({
            id: 'c2',
            author: 'sam.bernard',
            createdAt: '2026-11-03T09:00:00.000Z',
            body: 'Format ISO 8601, réponse interne non publique.',
            visibility: 'restricted',
          }),
        ],
      })
    );

    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('Quel format de date');
    expect(outcome.reason).not.toContain('réponse interne non publique');
  });
});
