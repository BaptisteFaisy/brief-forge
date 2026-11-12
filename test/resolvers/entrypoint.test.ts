/**
 * Câblage des résolveurs de `src/index.ts`.
 *
 * Aucun test ne couvrait le point d'entrée Forge : ces trois résolveurs sont
 * pourtant le seul chemin par lequel la boucle d'apprentissage (revue → leçon,
 * BC-14) et les indicateurs réels (§ 18) atteignent l'utilisateur. On isole le
 * résolveur et les deux modules branchés ; rien d'autre n'est appelé.
 */
jest.mock('@forge/resolver', () => {
  // Le registre vit dans la fabrique : `jest.mock` est hissé au-dessus des
  // déclarations du fichier, une constante extérieure serait en zone morte.
  const handlers: Record<string, (args: any) => Promise<any>> = {};
  return {
    __esModule: true,
    __handlers: handlers,
    default: class FakeResolver {
      define(name: string, fn: (args: any) => Promise<any>) {
        handlers[name] = fn;
      }

      getDefinitions() {
        return handlers;
      }
    },
  };
});

jest.mock('../../src/review', () => ({ recordReview: jest.fn() }));
jest.mock('../../src/metrics', () => ({
  projectMetrics: jest.fn(),
  toUiProjectMetrics: jest.fn(),
}));
// Le module réel reste en place (il est importable hors runtime) ; seule la
// lecture des réglages est doublée, car elle passerait par Forge SQL.
jest.mock('../../src/storage', () => ({
  ...jest.requireActual('../../src/storage'),
  loadProjectSettings: jest.fn().mockResolvedValue({ projectKey: 'PAY' }),
}));

import { projectMetrics, toUiProjectMetrics } from '../../src/metrics';
import { recordReview } from '../../src/review';

// Importé après les mocks : c'est lui qui remplit le registre du faux résolveur.
import '../../src/index';

/** Gestionnaires capturés au moment de l'import de `src/index.ts`. */
const handlers = (jest.requireMock('@forge/resolver') as {
  __handlers: Record<string, (args: any) => Promise<any>>;
}).__handlers;

const PROJECT_CONTEXT = { extension: { project: { key: 'PAY' } } };

describe('résolveurs : boucle d’apprentissage et indicateurs réels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirmReport enregistre une revue « confirmé » et rend l’état de la leçon', async () => {
    (recordReview as jest.Mock).mockResolvedValue({
      review: { id: 'rev-1' },
      lesson: null,
      lessonCreated: false,
      lessonSkippedReason: 'verdict-confirmé',
    });

    const result = await handlers.confirmReport({
      payload: { attemptId: 'att-1', issueKey: 'PAY-1', accountId: 'ana', note: 'rien à dire' },
    });

    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'att-1',
        issueKey: 'PAY-1',
        reviewerName: 'ana',
        verdict: 'confirmé',
        note: 'rien à dire',
      })
    );
    expect(result).toEqual({
      ok: true,
      reviewId: 'rev-1',
      lessonCreated: false,
      lessonId: null,
      lessonSkippedReason: 'verdict-confirmé',
    });
  });

  it('correctReport passe le verdict « corrigé » et remonte la leçon créée', async () => {
    (recordReview as jest.Mock).mockResolvedValue({
      review: { id: 'rev-2' },
      lesson: { id: 'les-7' },
      lessonCreated: true,
      lessonSkippedReason: null,
    });

    const result = await handlers.correctReport({
      payload: { attemptId: 'att-2', issueKey: 'PAY-2', note: 'la colonne existe déjà' },
    });

    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'corrigé', reviewerName: 'inconnu' })
    );
    expect(result).toEqual({
      ok: true,
      reviewId: 'rev-2',
      lessonCreated: true,
      lessonId: 'les-7',
      lessonSkippedReason: null,
    });
  });

  it('getProjectPage sert les indicateurs réels et leurs dénominateurs', async () => {
    const metrics = {
      confirmedWithoutCorrection: { percent: 84, denominator: 12, insufficientData: false },
    };
    const ui = { confirmedWithoutCorrectionRate: 84 };
    (projectMetrics as jest.Mock).mockResolvedValue(metrics);
    (toUiProjectMetrics as jest.Mock).mockReturnValue(ui);

    const result = await handlers.getProjectPage({ context: PROJECT_CONTEXT });

    expect(projectMetrics).toHaveBeenCalledWith('PAY');
    expect(result.metrics).toBe(ui);
    expect(result.metricsDetail).toBe(metrics);
  });

  it('getProjectPage refuse un contexte sans clé de projet, sans rien calculer', async () => {
    const result = await handlers.getProjectPage({ context: {} });

    expect(result.error).toContain('Clé de projet absente');
    expect(projectMetrics).not.toHaveBeenCalled();
  });
});
