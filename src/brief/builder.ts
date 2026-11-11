/**
 * Orchestration du brief : collecte → sections → condensation → budget →
 * Markdown + champs structurés.
 *
 * `buildBrief(issueKey, budget, deps)` est la seule porte d'entrée. Les
 * dépendances (collecte Jira/Confluence, stockage, modèle de condensation) sont
 * injectées : les tests n'ont donc aucun appel réseau, et le moteur reste
 * indépendant du module de collecte (contrat § 4.2).
 */

import { BUDGET_TOKENS } from '../config';
import { BriefData, Budget, SourcedItem } from '../types';
import { formatDateFr } from '../util/dates';
import { BriefError } from '../util/errors';
import { BRIEF_DATA_DISCLAIMER } from '../util/markdown';
import { BudgetResult, applyBudget, visibleItems } from './budget';
import { CondenseFn, condenseText, passthroughCondenser } from './condenser';
import {
  AttemptRecord,
  BriefInput,
  DecisionRecord,
  IssueSnapshot,
  LessonRecord,
  NeighborChange,
  ProjectSettings,
} from './inputs';
import { SectionSpec, sourcedOnly } from './sectionBuilder';
import { buildAcceptanceCriteria } from './sections/acceptanceCriteria';
import { buildAlreadyTried } from './sections/alreadyTried';
import { buildConstraints } from './sections/constraints';
import { buildDecisions } from './sections/decisions';
import { buildGaps } from './sections/gaps';
import { buildLessons } from './sections/lessons';
import { buildNeighborChanges } from './sections/neighborChanges';
import { buildObjective, objectiveText } from './sections/objective';
import { buildSources, sourceRefs } from './sections/sources';
import { buildWhoToAsk } from './sections/whoToAsk';

export type { CondenseInput } from './condenser';

/** Dépendances injectables (contrat § 4.2). Toutes sont optionnelles. */
export interface BriefDeps {
  collectIssue?: (issueKey: string) => Promise<IssueSnapshot>;
  collectDecisions?: (issue: IssueSnapshot, settings: ProjectSettings) => Promise<DecisionRecord[]>;
  collectNeighborChanges?: (issue: IssueSnapshot) => Promise<NeighborChange[]>;
  collectProjectSettings?: (projectKey: string) => Promise<ProjectSettings>;
  loadAttempts?: (issueKey: string) => Promise<AttemptRecord[]>;
  loadLessons?: (issueKey: string) => Promise<LessonRecord[]>;
  condense?: CondenseFn;
  readSettings?: (projectKey: string) => Promise<ProjectSettings>;
}

/** Plafond de jetons par élément, avant condensation : au-delà, on condense. */
const ITEM_CAP_TOKENS: Record<Budget, number> = { s: 80, m: 160, l: 320 };

type Loader<T> = () => Promise<T>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Collecte tolérante : un échec devient un trou signalé, jamais un mensonge. */
async function safe<T>(
  label: string,
  load: Loader<T>,
  fallback: T,
  errors: string[]
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    errors.push(`${label} indisponible (${messageOf(error)})`);
    return fallback;
  }
}

async function loadSettings(issue: IssueSnapshot, deps: BriefDeps): Promise<ProjectSettings> {
  if (deps.readSettings) return deps.readSettings(issue.projectKey);
  if (deps.collectProjectSettings) return deps.collectProjectSettings(issue.projectKey);
  throw new BriefError(
    'INTERNAL_ERROR',
    'Réglages projet indisponibles : injecter `readSettings` ou `collectProjectSettings`.'
  );
}

/**
 * Dépendances effectives : celles injectées, sinon le câblage production.
 *
 * Règle : si **au moins une** doublure est injectée, on n'utilise **que** les
 * doublures — un test ne doit jamais déclencher une collecte réelle. Sinon on
 * branche le câblage production (collecte Jira/Confluence + stockage).
 */
export function resolveDeps(deps: BriefDeps): BriefDeps {
  const injected = Object.keys(deps).some(
    (key) => deps[key as keyof BriefDeps] !== undefined
  );
  if (injected) return deps;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { defaultBriefDeps } = require('./defaults') as typeof import('./defaults');
  return { ...defaultBriefDeps(), ...deps };
}

/**
 * Collecte complète d'un ticket, chaque source pouvant échouer isolément.
 */
export async function collectAll(issueKey: string, deps: BriefDeps): Promise<BriefInput> {
  const effective = resolveDeps(deps);
  if (!effective.collectIssue) {
    throw new BriefError(
      'INTERNAL_ERROR',
      'Collecte indisponible : injecter `collectIssue` dans les dépendances du brief.'
    );
  }
  const issue = await effective.collectIssue(issueKey);
  const settings = await loadSettings(issue, effective);
  const errors: string[] = [];
  const [decisions, neighbors, attempts, lessons] = await Promise.all([
    safe('Décisions', () => effective.collectDecisions?.(issue, settings) ?? Promise.resolve([]), [], errors),
    safe('Changements voisins', () => effective.collectNeighborChanges?.(issue) ?? Promise.resolve([]), [], errors),
    safe('Tentatives', () => effective.loadAttempts?.(issueKey) ?? Promise.resolve([]), [], errors),
    safe('Leçons', () => effective.loadLessons?.(issueKey) ?? Promise.resolve([]), [], errors),
  ]);
  return { issue, settings, decisions, neighbors, attempts, lessons, errors };
}

/**
 * Condense un élément trop long (plafond par budget).
 *
 * La coupe **par nombre d'éléments** est du ressort de `applyBudget` : elle est
 * annoncée dans le brief. Ici on ne raccourcit que le texte d'un élément, en
 * gardant sa source et sa date.
 */
async function condenseSection(
  spec: SectionSpec,
  itemCap: number,
  condense: CondenseFn
): Promise<SectionSpec> {
  const items: SourcedItem[] = [];
  for (const item of sourcedOnly(spec.items)) {
    const text = await condenseText(item.text, itemCap, condense);
    if (text.trim().length > 0) items.push({ ...item, text });
  }
  return { ...spec, items };
}

/** Les dix sections, dans l'ordre officiel (§ 7.1), condensées. */
export async function buildSpecs(
  input: BriefInput,
  condense: CondenseFn,
  budget: Budget,
  builtAt: string
): Promise<SectionSpec[]> {
  const raw: SectionSpec[] = [
    buildObjective(input),
    buildAcceptanceCriteria(input),
    buildDecisions(input),
    buildAlreadyTried(input),
    buildNeighborChanges(input),
    buildConstraints(input),
    buildLessons(input),
    buildWhoToAsk(input),
    buildGaps(input, builtAt),
    buildSources(input),
  ];
  const itemCap = ITEM_CAP_TOKENS[budget];
  const condensed: SectionSpec[] = [];
  for (const spec of raw) {
    condensed.push(await condenseSection(spec, itemCap, condense));
  }
  return condensed.sort((a, b) => a.rank - b.rank);
}

/** En-tête : identité du brief + rappel que les blocs cités sont des données. */
export function briefHeader(
  input: BriefInput,
  budget: Budget,
  tokenTarget: number,
  builtAt: string
): string {
  const { issue } = input;
  return [
    `# Brief de travail — ${issue.issueKey} (budget ${budget}, cible ≈ ${tokenTarget} jetons)`,
    `_Construit le ${formatDateFr(builtAt)} · ${issue.issueType} · statut ${issue.status} · projet ${issue.projectKey}_`,
    BRIEF_DATA_DISCLAIMER,
  ].join('\n\n');
}

function toBriefData(
  input: BriefInput,
  budget: Budget,
  tokenTarget: number,
  result: BudgetResult
): BriefData {
  return {
    issueKey: input.issue.issueKey,
    budget,
    tokenTarget,
    objective: objectiveText(input),
    acceptanceCriteria: visibleItems(result, "Critères d'acceptation"),
    applicableDecisions: visibleItems(result, 'Décisions applicables'),
    failedAttempts: visibleItems(result, 'Déjà tenté'),
    neighborChanges: visibleItems(result, 'Changements voisins'),
    constraints: visibleItems(result, 'Contraintes'),
    lessons: visibleItems(result, 'Leçons'),
    whoToAsk: visibleItems(result, 'À qui demander'),
    gaps: visibleItems(result, 'Trous').map((item: SourcedItem) => item.text),
    sources: sourceRefs(input).map((ref) => ({ label: ref.label, url: ref.url, date: ref.date })),
    truncatedSections: result.truncatedSections,
    markdown: result.markdown,
  };
}

/** Ordre de précalcul des trois budgets. */
const BUDGET_ORDER: Budget[] = ['s', 'm', 'l'];

/** Rend un brief pour un budget à partir d'un contexte déjà collecté. */
async function renderBrief(
  input: BriefInput,
  budget: Budget,
  builtAt: string,
  condense: CondenseFn
): Promise<BriefData> {
  const tokenTarget = BUDGET_TOKENS[budget];
  const specs = await buildSpecs(input, condense, budget, builtAt);
  const header = briefHeader(input, budget, tokenTarget, builtAt);
  const result = applyBudget(specs, budget, header);
  return toBriefData(input, budget, tokenTarget, result);
}

/** Construit le brief d'un ticket pour un budget donné. */
export async function buildBrief(
  issueKey: string,
  budget: Budget,
  deps: BriefDeps = {}
): Promise<BriefData> {
  const input = await collectAll(issueKey, deps);
  return renderBrief(input, budget, new Date().toISOString(), deps.condense ?? passthroughCondenser);
}

/** Construit les trois budgets d'un ticket (brief précalculé, § 4.7). */
export async function buildAllBudgets(
  issueKey: string,
  deps: BriefDeps = {}
): Promise<Record<Budget, BriefData>> {
  const input = await collectAll(issueKey, deps);
  const builtAt = new Date().toISOString();
  const condense = deps.condense ?? passthroughCondenser;
  const out = {} as Record<Budget, BriefData>;
  for (const budget of BUDGET_ORDER) {
    out[budget] = await renderBrief(input, budget, builtAt, condense);
  }
  return out;
}
