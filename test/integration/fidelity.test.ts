/**
 * Test d'intégration « fidélité du brief » (lot C2 — contrat § 4).
 *
 * Pour chacune des 30 fixtures du lot C1 et chacun des trois budgets
 * (`s`, `m`, `l`) :
 *  1. `buildWorld(fixture)` fabrique le faux Jira / Confluence / Teamwork Graph ;
 *  2. `buildBrief(key, budget, world.briefDeps)` construit le brief (aucun réseau) ;
 *  3. `computeReadiness(issue, settings, extras)` score la préparation ;
 *  4. les indicateurs de `metrics.ts` sont calculés et **assertés** aux cibles
 *     du contrat (0 inventé, 0 fuite, 100 % sourcé/daté, budget ±10 %,
 *     troncature nommée, décisions anciennes marquées, bucket conforme,
 *     rappels ≥ 90 %) ;
 *  5. `docs/FIDELITY-REPORT.md` est écrit (trié, reproductible).
 *
 * Relancer : `npm run fidelity`.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { buildBrief } from '../../src/brief';
import type { DecisionRecord, IssueSnapshot, ProjectSettings } from '../../src/collect/types';
import { computeReadiness } from '../../src/readiness';
import type { BriefData, Budget, ReadinessScore } from '../../src/types';
import { FIXTURES, buildWorld } from './fakeJira';
import type { FakeWorld, FixtureSpec } from './fakeJira';
import { evaluateAllMetrics, matchesExpectedText } from './metrics';
import type { FidelityMetrics, MetricEvaluation } from './metrics';

const BUDGETS: Budget[] = ['s', 'm', 'l'];
const METRIC_NAMES = [
  'sourcesCoverage',
  'inventedItems',
  'budgetCompliance',
  'truncationNamed',
  'injectionLeak',
  'secretLeak',
  'gapRecall',
  'readinessAccuracy',
  'staleFlagged',
  'holesRecall',
] as const;
const REPORT_PATH = join(__dirname, '..', '..', 'docs', 'FIDELITY-REPORT.md');

/* ------------------------------------------------------------------ */
/* Contexte : collecte via les dépendances du monde simulé             */
/* ------------------------------------------------------------------ */

interface WorldContext {
  issue: IssueSnapshot;
  settings: ProjectSettings;
  decisions: DecisionRecord[];
}

async function contextOf(world: FakeWorld, fixture: FixtureSpec): Promise<WorldContext> {
  const deps = world.briefDeps;
  if (!deps.collectIssue) {
    throw new Error(`${fixture.key} : briefDeps.collectIssue manquant (lot C1).`);
  }
  const issue = await deps.collectIssue(fixture.key);
  const read = deps.readSettings ?? deps.collectProjectSettings;
  if (!read) {
    throw new Error(`${fixture.key} : réglages projet indisponibles (lot C1).`);
  }
  const settings = await read(fixture.projectKey);
  let decisions: DecisionRecord[] = [];
  if (deps.collectDecisions) {
    try {
      decisions = await deps.collectDecisions(issue, settings);
    } catch {
      // Panne simulée (fixtures 23/24) : comme le moteur, on continue sans.
      decisions = [];
    }
  }
  return { issue, settings, decisions };
}

function readinessOf(ctx: WorldContext, world: FakeWorld): ReadinessScore {
  return computeReadiness(ctx.issue, ctx.settings, {
    decisions: ctx.decisions,
    comments: ctx.issue.comments,
    attempts: world.attempts,
  });
}

/* ------------------------------------------------------------------ */
/* Vérifications complémentaires : champs `expected` du contrat § 2    */
/* ------------------------------------------------------------------ */

function isTruncated(brief: BriefData, section: string): boolean {
  return (brief.truncatedSections ?? []).includes(section);
}

function countFailure(
  label: string,
  expected: number,
  actual: number,
  truncated: boolean
): string | null {
  if (actual === expected) return null;
  if (truncated && actual < expected) return null; // coupe budgétaire annoncée
  return `${label} : attendu ${expected}, obtenu ${actual}`;
}

function checkCitations(brief: BriefData, fixture: FixtureSpec, budget: Budget): string[] {
  const expected = fixture.expected;
  const failures: string[] = [];
  const decisions = countFailure(
    'decisionsCited',
    expected.decisionsCited,
    brief.applicableDecisions.length,
    isTruncated(brief, 'Décisions applicables')
  );
  if (decisions) failures.push(decisions);
  const criteria = countFailure(
    'criteriaCited',
    expected.criteriaCited,
    brief.acceptanceCriteria.length,
    isTruncated(brief, "Critères d'acceptation")
  );
  if (criteria) failures.push(criteria);
  if (expected.neighborsCited !== undefined) {
    const neighbors = countFailure(
      'neighborsCited',
      expected.neighborsCited,
      brief.neighborChanges.length,
      isTruncated(brief, 'Changements voisins')
    );
    if (neighbors) failures.push(neighbors);
  }
  if (expected.attemptsFirst) {
    const first = brief.failedAttempts[0];
    if (!first || !matchesExpectedText(first.text, expected.attemptsFirst)) {
      failures.push(`attemptsFirst : « ${expected.attemptsFirst} » absent de la tête de « Déjà tenté »`);
    }
  }
  for (const needle of expected.mustAppear ?? []) {
    if (matchesExpectedText(brief.markdown, needle)) continue;
    // Une coupe budgétaire annoncée peut légitimement masquer un texte attendu.
    if ((brief.truncatedSections ?? []).length > 0) continue;
    failures.push(`mustAppear : « ${needle} » absent du markdown (budget ${budget})`);
  }
  return failures;
}

/* ------------------------------------------------------------------ */
/* Exécution d'une fixture sur les trois budgets                       */
/* ------------------------------------------------------------------ */

interface BudgetRun {
  budget: Budget;
  tokens: number;
  metrics: FidelityMetrics | null;
  failures: string[];
}

interface FixtureRun {
  fixture: FixtureSpec;
  score: ReadinessScore | null;
  runs: BudgetRun[];
  error?: string;
}

function metricFailures(metrics: FidelityMetrics): string[] {
  return METRIC_NAMES.filter((name) => !metrics[name].passed).map(
    (name) => `${name} : ${metrics[name].details ?? 'cible non atteinte'}`
  );
}

async function runFixture(fixture: FixtureSpec, now: Date): Promise<FixtureRun> {
  try {
    const world = buildWorld(fixture);
    const ctx = await contextOf(world, fixture);
    const score = readinessOf(ctx, world);
    const runs: BudgetRun[] = [];
    for (const budget of BUDGETS) {
      const brief = await buildBrief(fixture.key, budget, world.briefDeps);
      const metrics = evaluateAllMetrics(brief, score, fixture, now);
      runs.push({
        budget,
        tokens: metrics.budgetCompliance.value,
        metrics,
        failures: [...metricFailures(metrics), ...checkCitations(brief, fixture, budget)],
      });
    }
    return { fixture, score, runs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fixture,
      score: null,
      error: message,
      runs: BUDGETS.map((budget) => ({ budget, tokens: 0, metrics: null, failures: [message] })),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Rapport reproductible : docs/FIDELITY-REPORT.md                     */
/* ------------------------------------------------------------------ */

const METRIC_TARGETS: Record<(typeof METRIC_NAMES)[number], string> = {
  sourcesCoverage: '100 %',
  inventedItems: '0',
  budgetCompliance: 'cible +10 % max',
  truncationNamed: '100 %',
  injectionLeak: '0',
  secretLeak: '0',
  gapRecall: '≥ 90 %',
  readinessAccuracy: '100 %',
  staleFlagged: '100 %',
  holesRecall: '≥ 90 %',
};

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function cell(metric: MetricEvaluation | undefined, asPercent: boolean): string {
  if (!metric) return '—';
  const shown = asPercent ? percent(metric.value) : String(metric.value);
  return metric.passed ? shown : `**${shown} ✗**`;
}

function aggregateRows(results: FixtureRun[]): string[] {
  const total = results.length * BUDGETS.length;
  return METRIC_NAMES.map((name) => {
    const passed = results
      .flatMap((result) => result.runs)
      .filter((run) => run.metrics?.[name].passed).length;
    const mark = passed === total ? '✓' : '✗';
    return `| \`${name}\` | ${METRIC_TARGETS[name]} | ${passed}/${total} ${mark} |`;
  });
}

function fixtureRows(results: FixtureRun[]): string[] {
  const rows: string[] = [];
  for (const result of results) {
    for (const run of result.runs) {
      const m = run.metrics;
      const readiness = result.score
        ? `${result.score.status} (${result.score.score})`
        : 'erreur';
      rows.push(
        `| ${result.fixture.key} | ${result.fixture.scenario} | ${run.budget} | ${run.tokens} ` +
          `| ${cell(m?.sourcesCoverage, true)} | ${cell(m?.inventedItems, false)} ` +
          `| ${cell(m?.budgetCompliance, false)} | ${cell(m?.truncationNamed, true)} ` +
          `| ${cell(m?.injectionLeak, false)} | ${cell(m?.secretLeak, false)} ` +
          `| ${cell(m?.gapRecall, true)} | ${cell(m?.holesRecall, true)} | ${readiness} ` +
          `| ${cell(m?.staleFlagged, true)} | ${run.failures.length === 0 ? '✓' : `✗ ${run.failures.length}`} |`
      );
    }
  }
  return rows;
}

function failuresSection(results: FixtureRun[]): string[] {
  const lines: string[] = [];
  for (const result of results) {
    for (const run of result.runs) {
      for (const failure of run.failures) {
        lines.push(`- **${result.fixture.key}** (budget ${run.budget}) : ${failure}`);
      }
    }
  }
  return lines.length > 0 ? lines : ['Aucun écart : toutes les cibles du contrat sont atteintes.'];
}

function titleSection(generatedOn: string): string[] {
  return [
    '# Rapport de fidélité — brief-forge',
    '',
    `> Généré le ${generatedOn} par \`npm run fidelity\` (jest :`,
    '> `test/integration/fidelity.test.ts`). Reproductible : mêmes fixtures → même',
    '> rapport (lignes triées par fixture puis budget) ; seule la date de génération',
    '> varie. Les compteurs de jetons incluent l’en-tête « Construit le … » du brief,',
    '> ils sont donc stables à jour de génération donné.',
    '',
  ];
}

function methodSection(fixtureCount: number): string[] {
  return [
    '## Méthode',
    '',
    `- ${fixtureCount} fixtures du lot C1 (\`test/integration/fixtures/\`) × budgets \`s\`, \`m\`, \`l\`.`,
    '- Monde simulé `buildWorld(fixture)` : faux Jira / Confluence / Teamwork Graph,',
    '  aucun appel réseau ; brief construit par `buildBrief(key, budget, world.briefDeps)`,',
    '  préparation par `computeReadiness(issue, settings, { decisions, comments, attempts })`.',
    '- Indicateurs : fonctions pures de `test/integration/metrics.ts` (cibles du contrat § 4).',
    '',
    '## Interprétations retenues',
    '',
    '- `budgetCompliance` : le socle garantit la **borne haute** (`estimateTokens(markdown)`',
    '  ≤ cible × 1,10 — `BUDGET_TOLERANCE`) ; un brief plus court que la cible est conforme',
    '  (exigence de sobriété). La colonne affiche les jetons mesurés.',
    '- `gapRecall` : rappel des `gapsExpected` dans `ReadinessScore.gaps` ; `holesRecall`',
    '  (complément) : rappel des `holesExpected` dans la section 9 « Trous » du brief.',
    '- `secretLeak` : secrets **et** contenus confidentiels interdits (visibilité restreinte,',
    '  page d’une source en panne) ; `injectionLeak` : instructions adressées à un agent.',
    '- `inventedItems` : traçabilité par comparaison normalisée (casse, accents, apostrophes,',
    '  espaces, ponctuation) des éléments des 7 sections sourcées contre les graines de la',
    '  fixture (résumé, description, critères, champs personnalisés, décisions, tentatives,',
    '  voisins, commentaires, liens, leçons, contraintes, personnes). Sections « Trous » et',
    '  « Sources » (produites par le moteur) et champ `objective` hors périmètre du comptage.',
    '- Citations attendues (`decisionsCited`, `criteriaCited`, `neighborsCited`,',
    '  `attemptsFirst`, `mustAppear`) : assertées par budget ; une coupe budgétaire annoncée',
    '  (troncature nommée) tolère un compte inférieur, jamais un compte supérieur.',
    '',
  ];
}

function notCoveredSection(): string[] {
  return [
    '## Ce qui n’est pas couvert',
    '',
    '- **Aucun appel réel** à Jira, Confluence ou Teamwork Graph : tout passe par les',
    '  transports simulés du lot C1 ; les comportements réels d’API (pagination réseau,',
    '  erreurs HTTP authentiques, CQL côté serveur) ne sont pas éprouvés ici.',
    '- **Modèle de condensation non branché** : le harnais utilise le repli `passthrough`',
    '  (texte d’origine) ; la condensation par LLM et ses dérives potentielles (perte de',
    '  source, réécriture infidèle) ne sont pas mesurées.',
    '- **Les mesures portent sur le code** (moteur de brief + score de préparation) exécuté',
    '  hors Forge : ni le rendu dans un site Jira réel, ni les écrans UI, ni les délais',
    '  d’une action Forge (55 s) ne sont couverts par ce rapport.',
    '- `detectInstructionViaModel` (détection d’injection par modèle) n’est pas branché :',
    '  seule la détection déterministe par motifs du socle est en jeu.',
    '- La détection d’« élément inventé » est lexicale (normalisation + couverture de mots) :',
    '  une recomposition fidèle mot à mot mais sémantiquement trompeuse ne serait pas prise.',
    '',
  ];
}

function renderReport(results: FixtureRun[], generatedOn: string): string {
  const lines = [
    ...titleSection(generatedOn),
    ...methodSection(results.length),
    '## Agrégat global',
    '',
    '| Indicateur | Cible | Conformité |',
    '|---|---|---|',
    ...aggregateRows(results),
    '',
    '## Détail par fixture',
    '',
    '| Ticket | Scénario | Budget | Jetons | Sources | Inventés | Budget | Tronc. |',
    '| Injection | Secret | Gaps | Trous | Préparation | Anciennes | Citations |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...fixtureRows(results),
    '',
    '## Écarts constatés',
    '',
    ...failuresSection(results),
    '',
    ...notCoveredSection(),
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Corps du test                                                       */
/* ------------------------------------------------------------------ */

describe('fidélité du brief sur les 30 fixtures (contrat § 4)', () => {
  const runStartedAt = new Date();
  const results: FixtureRun[] = [];

  beforeAll(async () => {
    for (const fixture of FIXTURES) {
      results.push(await runFixture(fixture, runStartedAt));
    }
  }, 240_000);

  afterAll(() => {
    const generatedOn = runStartedAt.toISOString().slice(0, 10);
    mkdirSync(join(__dirname, '..', '..', 'docs'), { recursive: true });
    writeFileSync(REPORT_PATH, renderReport(results, generatedOn), 'utf8');
  });

  it('dispose des 30 fixtures du contrat', () => {
    expect(FIXTURES.length).toBe(30);
    expect(new Set(FIXTURES.map((f) => f.key)).size).toBe(30);
  });

  for (const fixture of FIXTURES) {
    describe(`${fixture.key} — ${fixture.scenario}`, () => {
      for (const budget of BUDGETS) {
        it(`budget ${budget} : cibles du contrat atteintes`, () => {
          const result = results.find((r) => r.fixture.key === fixture.key);
          expect(result).toBeDefined();
          const run = result?.runs.find((r) => r.budget === budget);
          expect(run?.failures ?? ['exécution manquante']).toEqual([]);
        });
      }
    });
  }

  it('toutes les cibles du contrat sont atteintes sur les 90 briefs', () => {
    const failures = results.flatMap((result) =>
      result.runs.flatMap((run) =>
        run.failures.map((f) => `${result.fixture.key}/${run.budget} : ${f}`)
      )
    );
    expect(failures).toEqual([]);
  });
});
