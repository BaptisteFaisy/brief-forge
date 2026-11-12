/**
 * Tests des quatre indicateurs de projet (§ 18).
 *
 * Les données sont des lignes SQL construites à la main, injectées dans un
 * faux client : aucun réseau, aucune donnée simulée « de façade » (chaque
 * ligne est une vraie ligne de table).
 */

import {
  CLARIFICATION_TOOL,
  MIN_SAMPLE_SIZE,
  clarificationsAskedVsGuessed,
  confirmedWithoutCorrectionRate,
  projectLikePattern,
  projectMetrics,
  repeatedAttemptsAvoided,
  toUiProjectMetrics,
  topGaps,
} from '../../src/metrics';
import { criterionLabel } from '../../src/readiness';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';
import type { UIProjectMetrics } from '../../src/ui/data';
import { FakeProjectSqlClient } from './fakeProjectSql';
import {
  accessLogRow,
  attemptRow,
  briefRow,
  gap,
  readinessRow,
  reviewRow,
} from './fixtures';

const CRITERIA = criterionLabel('acceptanceCriteria');
const COMPONENT = criterionLabel('componentIdentified');

describe('confirmedWithoutCorrectionRate', () => {
  let fake: FakeProjectSqlClient;

  beforeEach(() => {
    fake = new FakeProjectSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('compte la part des comptes rendus confirmés sans correction', async () => {
    fake.seed('review', [
      reviewRow({ id: 'r1', attempt_id: 'att-1', verdict: 'confirmé' }),
      reviewRow({ id: 'r2', attempt_id: 'att-2', verdict: 'confirmé' }),
      reviewRow({ id: 'r3', attempt_id: 'att-3', verdict: 'confirmé' }),
      reviewRow({ id: 'r4', attempt_id: 'att-4', verdict: 'confirmé' }),
      reviewRow({ id: 'r5', attempt_id: 'att-5', verdict: 'corrigé' }),
    ]);

    const metric = await confirmedWithoutCorrectionRate('PAY');

    expect(metric.numerator).toBe(4);
    expect(metric.denominator).toBe(5);
    expect(metric.percent).toBe(80);
    expect(metric.insufficientData).toBe(false);
  });

  it('fait primer la dernière revue d’un compte rendu', async () => {
    fake.seed('review', [
      reviewRow({
        id: 'r1',
        attempt_id: 'att-1',
        verdict: 'confirmé',
        created_at: '2026-11-10T10:00:00.000Z',
      }),
      reviewRow({
        id: 'r2',
        attempt_id: 'att-1',
        verdict: 'corrigé',
        created_at: '2026-11-11T10:00:00.000Z',
      }),
      reviewRow({ id: 'r3', attempt_id: 'att-2', verdict: 'confirmé' }),
      reviewRow({ id: 'r4', attempt_id: 'att-3', verdict: 'confirmé' }),
      reviewRow({ id: 'r5', attempt_id: 'att-4', verdict: 'confirmé' }),
    ]);

    const metric = await confirmedWithoutCorrectionRate('PAY', { minSample: 1 });

    expect(metric.denominator).toBe(4);
    expect(metric.numerator).toBe(3);
    expect(metric.percent).toBe(75);
  });

  it('ignore les revues d’un autre projet', async () => {
    fake.seed('review', [
      reviewRow({ id: 'r1', attempt_id: 'att-1', verdict: 'confirmé' }),
      reviewRow({ id: 'r2', attempt_id: 'att-2', verdict: 'corrigé', issue_key: 'OPS-7' }),
    ]);

    const metric = await confirmedWithoutCorrectionRate('PAY');

    expect(metric.denominator).toBe(1);
    expect(metric.numerator).toBe(1);
  });

  it('ne publie aucun pourcentage quand l’échantillon est trop petit', async () => {
    fake.seed('review', [
      reviewRow({ id: 'r1', attempt_id: 'att-1', verdict: 'confirmé' }),
      reviewRow({ id: 'r2', attempt_id: 'att-2', verdict: 'confirmé' }),
    ]);

    const metric = await confirmedWithoutCorrectionRate('PAY');

    expect(metric.denominator).toBe(2);
    expect(metric.numerator).toBe(2);
    expect(metric.percent).toBeNull();
    expect(metric.insufficientData).toBe(true);
  });

  it('ne publie aucun pourcentage sans aucune donnée', async () => {
    const metric = await confirmedWithoutCorrectionRate('PAY');

    expect(metric.denominator).toBe(0);
    expect(metric.numerator).toBe(0);
    expect(metric.percent).toBeNull();
    expect(metric.insufficientData).toBe(true);
  });
});

describe('clarificationsAskedVsGuessed', () => {
  let fake: FakeProjectSqlClient;

  beforeEach(() => {
    fake = new FakeProjectSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('compte les clarifications demandées et les hypothèses prises', async () => {
    fake.seed('access_log', [
      accessLogRow({ id: 'l1', tool: CLARIFICATION_TOOL }),
      accessLogRow({ id: 'l2', tool: CLARIFICATION_TOOL }),
      accessLogRow({ id: 'l3', tool: CLARIFICATION_TOOL }),
      accessLogRow({ id: 'l4', tool: 'get-work-brief' }),
      accessLogRow({ id: 'l5', tool: 'post-work-report' }),
    ]);
    fake.seed('attempt', [
      attemptRow({ id: 'att-1', report_md: '## Hypothèses prises\n- Signature SHA256 par défaut' }),
      attemptRow({ id: 'att-2', report_md: '## Hypothèses prises\n- Timeout 30 s' }),
      attemptRow({ id: 'att-3', report_md: '## Statut : terminé' }),
    ]);

    const metric = await clarificationsAskedVsGuessed('PAY');

    expect(metric.numerator).toBe(3);
    expect(metric.denominator).toBe(5);
    expect(metric.percent).toBe(60);
    expect(metric.insufficientData).toBe(false);
  });

  it('ne compte pas une section « Hypothèses prises » vide', async () => {
    fake.seed('attempt', [
      attemptRow({
        id: 'att-1',
        report_md: '## Statut : terminé\n## Hypothèses prises\n\n## Tests lancés et résultat\n3/3',
      }),
    ]);

    const metric = await clarificationsAskedVsGuessed('PAY');

    expect(metric.denominator).toBe(0);
    expect(metric.percent).toBeNull();
    expect(metric.insufficientData).toBe(true);
  });

  it('ignore les traces d’un autre projet', async () => {
    fake.seed('access_log', [accessLogRow({ id: 'l1', tool: CLARIFICATION_TOOL, issue_key: 'OPS-7' })]);

    const metric = await clarificationsAskedVsGuessed('PAY');

    expect(metric.numerator).toBe(0);
    expect(metric.denominator).toBe(0);
  });
});

describe('repeatedAttemptsAvoided', () => {
  let fake: FakeProjectSqlClient;

  beforeEach(() => {
    fake = new FakeProjectSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('compte les tickets dont le brief servi avait une section « Déjà tenté »', async () => {
    fake.seed('brief', [
      briefRow('PAY-142', 'm', [{ text: 'Tentative précédente' }]),
      briefRow('PAY-142', 'l', []),
      briefRow('PAY-143', 'm', []),
      briefRow('PAY-144', 's', [{ text: 'Tentative A' }, { text: 'Tentative B' }]),
      briefRow('OPS-7', 'm', [{ text: 'Autre projet' }]),
    ]);

    const metric = await repeatedAttemptsAvoided('PAY');

    expect(metric.count).toBe(2);
    expect(metric.denominator).toBe(3);
    expect(metric.insufficientData).toBe(false);
  });

  it('sans donnée, ne publie aucun compte', async () => {
    const metric = await repeatedAttemptsAvoided('PAY');

    expect(metric.count).toBe(0);
    expect(metric.denominator).toBe(0);
    expect(metric.insufficientData).toBe(true);
  });
});

describe('topGaps', () => {
  let fake: FakeProjectSqlClient;

  beforeEach(() => {
    fake = new FakeProjectSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('compte les manques les plus fréquents, avec leur libellé anglais', async () => {
    fake.seed('readiness', [
      readinessRow('PAY-142', [gap(CRITERIA)]),
      readinessRow('PAY-143', [gap(CRITERIA), gap(COMPONENT)]),
      readinessRow('PAY-144', [gap(CRITERIA)]),
    ]);

    const metric = await topGaps('PAY');

    expect(metric.denominator).toBe(3);
    expect(metric.gaps[0]).toEqual({
      labelFr: CRITERIA,
      labelEn: 'Verifiable acceptance criteria',
      count: 3,
    });
    expect(metric.gaps[1]).toEqual({
      labelFr: COMPONENT,
      labelEn: 'Identified component',
      count: 1,
    });
    expect(metric.insufficientData).toBe(false);
  });

  it('respecte la limite demandée', async () => {
    fake.seed('readiness', [
      readinessRow('PAY-142', [gap(CRITERIA), gap(COMPONENT)]),
      readinessRow('PAY-143', [gap(CRITERIA)]),
    ]);

    const metric = await topGaps('PAY', 1);

    expect(metric.gaps).toHaveLength(1);
    expect(metric.gaps[0]?.count).toBe(2);
  });

  it('garde le libellé stocké pour un critère inconnu', async () => {
    fake.seed('readiness', [readinessRow('PAY-142', [gap('Autre manque')])]);

    const metric = await topGaps('PAY');

    expect(metric.gaps[0]).toEqual({ labelFr: 'Autre manque', labelEn: 'Autre manque', count: 1 });
  });

  it('sans donnée, ne publie aucun manque', async () => {
    const metric = await topGaps('PAY');

    expect(metric.gaps).toEqual([]);
    expect(metric.denominator).toBe(0);
    expect(metric.insufficientData).toBe(true);
  });
});

describe('projectMetrics et projection écran', () => {
  let fake: FakeProjectSqlClient;

  beforeEach(() => {
    fake = new FakeProjectSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('agrège les quatre indicateurs', async () => {
    fake.seed('review', [
      reviewRow({ id: 'r1', attempt_id: 'att-1', verdict: 'confirmé' }),
      reviewRow({ id: 'r2', attempt_id: 'att-2', verdict: 'confirmé' }),
    ]);
    fake.seed('brief', [briefRow('PAY-142', 'm', [{ text: 'Tentative' }])]);
    fake.seed('readiness', [readinessRow('PAY-142', [gap(CRITERIA)])]);

    const metrics = await projectMetrics('PAY');

    expect(metrics.confirmedWithoutCorrection.denominator).toBe(2);
    expect(metrics.clarificationsAskedVsGuessed.denominator).toBe(0);
    expect(metrics.repeatedAttemptsAvoided.count).toBe(1);
    expect(metrics.topGaps.gaps).toHaveLength(1);
  });

  it('produit une forme acceptée par l’écran projet', async () => {
    fake.seed('readiness', [readinessRow('PAY-142', [gap(CRITERIA)])]);

    const metrics = await projectMetrics('PAY');
    const ui: UIProjectMetrics = toUiProjectMetrics(metrics);

    expect(ui.confirmedWithoutCorrectionRate).toBeNull();
    expect(ui.clarificationsAskedVsGuessedRate).toBeNull();
    expect(ui.repeatedAttemptsAvoidedCount).toBe(0);
    expect(ui.topGaps[0]).toEqual({
      labelFr: CRITERIA,
      labelEn: 'Verifiable acceptance criteria',
      count: 1,
    });
  });

  it('signale l’insuffisance de données plutôt qu’un pourcentage inventé', async () => {
    const metrics = await projectMetrics('PAY');
    const ui = toUiProjectMetrics(metrics);

    expect(metrics.confirmedWithoutCorrection.insufficientData).toBe(true);
    expect(metrics.confirmedWithoutCorrection.percent).toBeNull();
    expect(ui.confirmedWithoutCorrectionRate).toBeNull();
    expect(MIN_SAMPLE_SIZE).toBe(5);
  });
});

describe('projectLikePattern', () => {
  it('échappe les jokers du nom de projet', () => {
    expect(projectLikePattern('PAY')).toBe('PAY-%');
    expect(projectLikePattern('OPS_2')).toBe('OPS\\_2-%');
  });
});
