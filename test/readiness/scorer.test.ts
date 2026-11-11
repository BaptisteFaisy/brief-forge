/**
 * Tests du score de préparation : décision, barème, explication des points
 * perdus. Ce fichier couvre le contrat visible par l'utilisateur ; chaque
 * critère a son propre fichier de tests unitaires.
 */

import { READINESS_THRESHOLDS, READINESS_WEIGHTS } from '../../src/config';
import { computeReadiness } from '../../src/readiness';
import { makeDecision, makeEmptyIssue, makeIssue, makeSettings } from './fixtures';

describe('computeReadiness — décision', () => {
  it('donne 100 à un ticket parfait et le déclare prêt', () => {
    const result = computeReadiness(makeIssue(), makeSettings());

    expect(result.score).toBe(100);
    expect(result.status).toBe('prêt');
    expect(result.ready).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.issueKey).toBe('PAY-123');
    expect(result.advice).toContain('Prêt');
  });

  it('donne moins de 40 à un ticket vide et le déclare non prêt', () => {
    const result = computeReadiness(makeEmptyIssue(), makeSettings());

    expect(result.score).toBeLessThan(40);
    expect(result.status).toBe('non prêt');
    expect(result.ready).toBe(false);
    expect(result.gaps.length).toBeGreaterThanOrEqual(4);
  });

  it('plafonne sous 40 un ticket sans description, même bien entouré', () => {
    const result = computeReadiness(
      makeIssue({ description: '', acceptanceCriteria: [] }),
      makeSettings()
    );

    expect(result.score).toBe(READINESS_THRESHOLDS.needsPrecision - 1);
    expect(result.status).toBe('non prêt');
    const objectiveGap = result.gaps.find((gap) => gap.criterion === 'Objectif écrit');
    expect(objectiveGap).toBeDefined();
    expect(objectiveGap?.reason).toContain('description absente');
  });

  it('classe « à préciser » un ticket entre 40 et 69', () => {
    const result = computeReadiness(
      makeIssue({
        description: 'Refondre la page de facturation pour la rendre plus claire et plus rapide.',
        acceptanceCriteria: [],
        components: [],
      }),
      makeSettings()
    );

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(READINESS_THRESHOLDS.ready);
    expect(result.status).toBe('à préciser');
    expect(result.ready).toBe(false);
    expect(result.advice).toContain('À préciser');
  });
});

describe('computeReadiness — explication des points perdus', () => {
  it('explique chaque point perdu, sans exception', () => {
    const result = computeReadiness(
      makeEmptyIssue(),
      makeSettings({ decisionLabels: [] })
    );

    expect(result.gaps.length).toBeGreaterThan(0);
    for (const gap of result.gaps) {
      expect(gap.criterion.length).toBeGreaterThan(0);
      expect(gap.pointsLost).toBeGreaterThan(0);
      expect(gap.reason.trim().length).toBeGreaterThan(10);
    }
  });

  it('fait toujours score + points perdus = 100', () => {
    const cases = [
      computeReadiness(makeIssue(), makeSettings()),
      computeReadiness(makeEmptyIssue(), makeSettings()),
      computeReadiness(makeIssue({ description: '', components: [] }), makeSettings()),
      computeReadiness(makeIssue({ components: [], reporter: '', assignee: '' }), makeSettings()),
    ];

    for (const result of cases) {
      const lost = result.gaps.reduce((total, gap) => total + gap.pointsLost, 0);
      expect(result.score + lost).toBe(100);
    }
  });

  it('trie les manques du plus coûteux au moins coûteux', () => {
    const result = computeReadiness(makeEmptyIssue(), makeSettings());
    const points = result.gaps.map((gap) => gap.pointsLost);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it('nomme les manques en clair et donne un conseil actionnable', () => {
    const result = computeReadiness(makeIssue({ acceptanceCriteria: [], description: 'Corriger le total.' }), makeSettings());

    const labels = result.gaps.map((gap) => gap.criterion);
    expect(labels).toContain('Critères d’acceptation vérifiables');
    expect(result.advice).toContain('critères d’acceptation observables');
  });

  it('reprend le barème de config.ts sans le recopier', () => {
    const total = Object.values(READINESS_WEIGHTS).reduce((sum, points) => sum + points, 0);
    expect(total).toBe(100);
    expect(computeReadiness(makeIssue(), makeSettings()).score).toBe(total);
  });
});

describe('computeReadiness — décisions contradictoires', () => {
  it('retire les 10 points et explique la contradiction', () => {
    const result = computeReadiness(makeIssue(), makeSettings(), {
      decisions: [
        makeDecision({
          title: 'Le cache Redis est obligatoire',
          body: 'Toutes les lectures de factures passent par le cache Redis, c’est obligatoire.',
          date: '2026-03-12',
        }),
        makeDecision({
          title: 'Supprimer le cache Redis',
          body: 'On supprime le cache Redis, ne pas l’utiliser pour les factures.',
          date: '2026-06-05',
        }),
      ],
    });

    expect(result.score).toBe(100 - READINESS_WEIGHTS.noContradictoryDecision);
    const gap = result.gaps.find((item) => item.criterion === 'Aucune décision contradictoire');
    expect(gap?.pointsLost).toBe(10);
    expect(gap?.reason).toContain('se contredisent');
  });
});
