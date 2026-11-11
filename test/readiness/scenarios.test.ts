/**
 * Scénarios de bout en bout du score : un ticket réaliste à moitié prêt, et
 * les formes d'écriture des critères d'acceptation rencontrées sur le terrain.
 */

import { computeReadiness } from '../../src/readiness';
import { makeComment, makeIssue, makeSettings } from './fixtures';

describe('computeReadiness — ticket réaliste à préciser', () => {
  const issue = makeIssue({
    summary: 'Le total de la facture est faux',
    description: 'Quand on ajoute une ligne de TVA, le total ne se met pas à jour sur la page Facturation.',
    components: ['Facturation'],
    acceptanceCriteria: [],
    comments: [
      makeComment({
        author: 'claire.martin',
        body: 'Faut-il arrondir à 2 décimales ou garder la précision complète ?',
      }),
    ],
  });

  it('score, statut et manques disent la même chose', () => {
    const result = computeReadiness(issue, makeSettings());

    expect(result.status).toBe('à préciser');
    expect(result.score).toBe(60);
    expect(result.gaps.map((gap) => gap.criterion)).toEqual([
      'Critères d’acceptation vérifiables',
      'Aucune question sans réponse',
    ]);
    expect(result.advice).toContain('À préciser');
    expect(result.advice).toContain('critères d’acceptation');
  });
});

describe('computeReadiness — robustesse de la collecte', () => {
  it('ne plante pas sur un ticket aux champs vides ou absents', () => {
    const degraded = {
      ...makeIssue(),
      components: undefined,
      labels: undefined,
      links: undefined,
      comments: undefined,
      acceptanceCriteria: undefined,
      customFields: undefined,
    } as unknown as ReturnType<typeof makeIssue>;

    const result = computeReadiness(degraded, makeSettings());

    expect(result.score).toBeLessThan(100);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps.map((gap) => gap.criterion)).toContain('Composant identifié');
    for (const gap of result.gaps) {
      expect(gap.reason.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('computeReadiness — écriture des critères', () => {  it('accepte une section inline « Critères d’acceptation : a ; b »', () => {
    const result = computeReadiness(
      makeIssue({
        description: [
          'Objectif : corriger le total de la facture.',
          '',
          'Critères d’acceptation : le total affiche 2 décimales ; un total négatif est refusé.',
        ].join('\n'),
        acceptanceCriteria: [],
      }),
      makeSettings()
    );

    expect(result.score).toBe(100);
    expect(result.gaps).toEqual([]);
  });

  it('explique le manque quand les critères sont des intentions', () => {
    const result = computeReadiness(
      makeIssue({
        description: 'Objectif : améliorer la page de facturation.',
        acceptanceCriteria: ['Améliorer la lisibilité', 'Rendre plus propre'],
      }),
      makeSettings()
    );

    const gap = result.gaps.find((item) => item.criterion === 'Critères d’acceptation vérifiables');
    expect(gap?.pointsLost).toBe(30);
    expect(gap?.reason).toContain('aucun n’est vérifiable');
  });
});
