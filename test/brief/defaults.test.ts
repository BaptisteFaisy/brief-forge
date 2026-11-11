/**
 * Tests du câblage par défaut des dépendances du brief.
 *
 * Le câblage production charge `@forge/api` et `@forge/sql` : on ne le teste
 * donc pas par un appel réel, mais en vérifiant que le résolveur de
 * dépendances fait le bon choix (injecté vs production).
 */

import { resolveDeps } from '../../src/brief/builder';
import { defaultBriefDeps } from '../../src/brief/defaults';

describe('defaultBriefDeps', () => {
  it('expose toutes les dépendances attendues par le contrat', () => {
    const deps = defaultBriefDeps();
    expect(typeof deps.collectIssue).toBe('function');
    expect(typeof deps.collectDecisions).toBe('function');
    expect(typeof deps.collectNeighborChanges).toBe('function');
    expect(typeof deps.readSettings).toBe('function');
    expect(typeof deps.loadAttempts).toBe('function');
    expect(typeof deps.loadLessons).toBe('function');
  });

  it('préfère les dépendances injectées', () => {
    const injected = { collectIssue: jest.fn() };
    expect(resolveDeps(injected)).toBe(injected);
  });

  it('ne branche aucune collecte réelle quand une doublure est injectée', () => {
    const injected = { loadAttempts: jest.fn() };
    const resolved = resolveDeps(injected);
    expect(resolved.collectIssue).toBeUndefined();
    expect(resolved.readSettings).toBeUndefined();
    expect(resolved.loadAttempts).toBe(injected.loadAttempts);
  });

  it('complète par le câblage production quand aucune collecte n’est injectée', () => {
    const resolved = resolveDeps({});
    expect(typeof resolved.collectIssue).toBe('function');
    expect(typeof resolved.readSettings).toBe('function');
  });
});
