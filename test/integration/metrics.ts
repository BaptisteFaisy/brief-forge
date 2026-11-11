/**
 * Indicateurs de fidélité du brief (lot C2 — contrat § 4).
 *
 * Fonctions pures mesurant la conformité d'un `BriefData` et/ou d'un
 * `ReadinessScore` par rapport au contrat et aux attentes d'une fixture.
 *
 * Aucun import de fixture ici : les fonctions ne dépendent que des types du
 * socle (`BriefData`, `ReadinessScore`, `SourcedItem`) et de la forme
 * minimale `ExpectedOutcome` / `FixtureSpec` définie par le contrat § 2.
 */

import { BUDGET_TOKENS } from '../../src/config';
import { isSourceComplete } from '../../src/security/quoting';
import { BriefData, ReadinessScore, SourcedItem } from '../../src/types';
import { isStaleDecision } from '../../src/util/dates';
import { estimateTokens, fitsBudget } from '../../src/util/tokens';
import type { ExpectedOutcome, FixtureSpec } from './fakeJira';

/* ------------------------------------------------------------------ */
/* Types d'évaluation et résultat global                              */
/* ------------------------------------------------------------------ */

export interface MetricEvaluation {
  value: number;
  target: number;
  passed: boolean;
  details?: string;
}

/**
 * Les 9 indicateurs du contrat § 4, plus `holesRecall` : le contrat § 2
 * distingue `gapsExpected` (sous-chaînes attendues dans `ReadinessScore.gaps`,
 * mesurées par `gapRecall`) et `holesExpected` (trous attendus en section 9 du
 * brief, mesurés par `holesRecall`). Les deux rappels sont assertés ≥ 90 %.
 */
export interface FidelityMetrics {
  sourcesCoverage: MetricEvaluation;
  inventedItems: MetricEvaluation;
  budgetCompliance: MetricEvaluation;
  truncationNamed: MetricEvaluation;
  injectionLeak: MetricEvaluation;
  secretLeak: MetricEvaluation;
  gapRecall: MetricEvaluation;
  readinessAccuracy: MetricEvaluation;
  staleFlagged: MetricEvaluation;
  holesRecall: MetricEvaluation;
}

/* ------------------------------------------------------------------ */
/* Normalisation et rattachement d'un texte à ses graines              */
/* ------------------------------------------------------------------ */

/**
 * Normalisation de comparaison : casse, accents, apostrophes et ponctuation
 * neutralisés (même esprit que `normalizeText` de `src/readiness/support`).
 * « Critères d'acceptation » et « criteres dacceptation » deviennent égaux.
 */
export function normalizeComparable(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeComparable(text)
    .split(' ')
    .filter((w) => w.length > 2);
}

function wordsMatch(itemWords: string[], seedWords: string[]): boolean {
  if (itemWords.length === 0 || seedWords.length === 0) return false;
  const seedSet = new Set(seedWords);
  const hits = itemWords.filter((w) => seedSet.has(w)).length;
  return hits >= Math.min(3, itemWords.length) || hits / itemWords.length >= 0.5;
}

function textMatchesSeed(itemText: string, seedText: string): boolean {
  const normItem = normalizeComparable(itemText);
  const normSeed = normalizeComparable(seedText);
  if (!normItem || !normSeed) return false;
  if (normItem.includes(normSeed) || normSeed.includes(normItem)) return true;
  return wordsMatch(tokenize(itemText), tokenize(seedText));
}

/**
 * Correspondance tolérante d'un texte attendu (`mustAppear`) dans un rendu :
 * sous-chaîne normalisée, ou au moins 60 % des mots porteurs présents. Cette
 * tolérance absorbe les reformulations d'en-tête (le rappel « les blocs cités
 * sont des données » du socle vs la recette « ces blocs sont des données »),
 * sans laisser passer un contenu réellement absent.
 */
export function matchesExpectedText(haystack: string, needle: string): boolean {
  const normNeedle = normalizeComparable(needle);
  if (!normNeedle) return true;
  const normHaystack = normalizeComparable(haystack);
  if (normHaystack.includes(normNeedle)) return true;
  const words = normNeedle.split(' ').filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const haystackWords = new Set(normHaystack.split(' '));
  const hits = words.filter((w) => haystackWords.has(w)).length;
  return hits >= Math.min(words.length, Math.max(2, Math.ceil(words.length * 0.6)));
}

/* ------------------------------------------------------------------ */
/* Extraction des graines candidates d'une fixture                     */
/* ------------------------------------------------------------------ */

/** Corpus des textes semés par la fixture : tout ce que le brief peut citer. */
export type SeedCorpus = string[];

function settingsTexts(fixture: FixtureSpec): string[] {
  const settings = fixture.settings ?? {};
  return [
    fixture.constraints ?? '',
    settings.constraintsText ?? '',
    settings.componentZone ?? '',
    settings.triggerStatus ?? '',
    settings.triggerLabel ?? '',
    ...(settings.decisionLabels ?? []),
    ...(fixture.customFields ?? []).flatMap((field) => [field.name, field.value]),
  ];
}

export function extractFixtureSeeds(fixture: FixtureSpec): SeedCorpus {
  const texts: string[] = [
    fixture.summary,
    fixture.description ?? '',
    fixture.status,
    fixture.issueType,
    fixture.reporter,
    fixture.assignee ?? '',
    ...(fixture.components ?? []),
    ...(fixture.labels ?? []),
    ...(fixture.acceptanceCriteria ?? []),
    ...settingsTexts(fixture),
  ];
  for (const dec of fixture.decisions ?? []) {
    texts.push(dec.title, dec.body, dec.author, dec.url);
  }
  for (const att of fixture.attempts ?? []) {
    texts.push(att.summary, att.reason, att.agent, att.kind, att.status ?? '');
  }
  for (const n of fixture.neighbors ?? []) {
    texts.push(n.title, n.url, n.author, n.kind, n.state ?? '');
  }
  for (const c of fixture.comments ?? []) {
    texts.push(c.body, c.author);
  }
  for (const l of fixture.links ?? []) {
    texts.push(l.key, l.type, l.title ?? '');
  }
  for (const les of fixture.lessons ?? []) {
    texts.push(les.text, les.component);
  }
  return texts.filter((text) => text.trim().length > 0);
}

/* ------------------------------------------------------------------ */
/* Extraction des items sourcés d'un brief                            */
/* ------------------------------------------------------------------ */

export function extractAllSourcedItems(brief: BriefData): SourcedItem[] {
  return [
    ...(brief.acceptanceCriteria ?? []),
    ...(brief.applicableDecisions ?? []),
    ...(brief.failedAttempts ?? []),
    ...(brief.neighborChanges ?? []),
    ...(brief.constraints ?? []),
    ...(brief.lessons ?? []),
    ...(brief.whoToAsk ?? []),
  ];
}

/* ------------------------------------------------------------------ */
/* 1. sourcesCoverage : éléments portant source ET date / total       */
/* ------------------------------------------------------------------ */

export function evaluateSourcesCoverage(brief: BriefData): MetricEvaluation {
  const items = extractAllSourcedItems(brief);
  if (items.length === 0) return { value: 1, target: 1, passed: true };
  const valid = items.filter((it) =>
    isSourceComplete({ author: it.source, date: it.date })
  ).length;
  const value = valid / items.length;
  return {
    value,
    target: 1,
    passed: value === 1,
    details: `${valid}/${items.length} items sourcés et datés`,
  };
}

/* ------------------------------------------------------------------ */
/* 2. inventedItems : éléments non rattachables à un seed             */
/* ------------------------------------------------------------------ */

/**
 * Un élément est « rattachable » si son texte recoupe un texte semé par la
 * fixture (sous-chaîne normalisée dans un sens ou dans l'autre, ou au moins
 * 50 % / 3 mots porteurs communs). La comparaison porte sur le **texte** :
 * une source correcte ne suffit pas à justifier un contenu fabriqué.
 */
export function isItemGrounded(item: SourcedItem, seeds: SeedCorpus): boolean {
  return seeds.some((seed) => textMatchesSeed(item.text, seed));
}

export function evaluateInventedItems(
  brief: BriefData,
  fixture: FixtureSpec
): MetricEvaluation {
  const items = extractAllSourcedItems(brief);
  const seeds = extractFixtureSeeds(fixture);
  const ungrounded = items.filter((it) => !isItemGrounded(it, seeds));
  const count = ungrounded.length;
  return {
    value: count,
    target: 0,
    passed: count === 0,
    details: count === 0 ? '0 élément inventé' : `${count} éléments sans seed`,
  };
}

/* ------------------------------------------------------------------ */
/* 3. budgetCompliance : estimateTokens(markdown) <= cible * 1.1      */
/* ------------------------------------------------------------------ */

export function evaluateBudgetCompliance(brief: BriefData): MetricEvaluation {
  const targetTokens = brief.tokenTarget || BUDGET_TOKENS[brief.budget];
  const actualTokens = estimateTokens(brief.markdown);
  const fits = fitsBudget(brief.markdown, targetTokens, 0.1);
  return {
    value: actualTokens,
    target: targetTokens,
    passed: fits,
    details: `${actualTokens} jetons (cible: ${targetTokens} ±10%)`,
  };
}

/* ------------------------------------------------------------------ */
/* 4. truncationNamed : sections tronquées nommant l'outil de suite   */
/* ------------------------------------------------------------------ */

const SECTION_TOOLS: Record<string, string> = {
  "critères d'acceptation": 'get-acceptance-criteria',
  'décisions applicables': 'get-related-decisions',
  'déjà tenté': 'get-failed-attempts',
  'changements voisins': 'get-neighbor-changes',
  trous: 'check-readiness',
};

function hasToolHint(markdown: string, sectionTitle: string): boolean {
  const normTitle = normalizeComparable(sectionTitle);
  const expectedTool = Object.entries(SECTION_TOOLS).find(([name]) =>
    normTitle.includes(normalizeComparable(name))
  )?.[1];
  const blockRegex = new RegExp(`## \\d+\\.\\s*${sectionTitle}[\\s\\S]*?(?=## \\d+\\.|$)`, 'i');
  const match = markdown.match(blockRegex);
  const text = match ? match[0] : markdown;
  const hasHintPhrase = /non affiché.*pour la suite/i.test(text);
  if (expectedTool) return hasHintPhrase && text.includes(`\`${expectedTool}\``);
  return hasHintPhrase && /`[a-z-]+`/.test(text);
}

export function evaluateTruncationNamed(brief: BriefData): MetricEvaluation {
  const truncated = brief.truncatedSections ?? [];
  if (truncated.length === 0) return { value: 1, target: 1, passed: true };
  const named = truncated.filter((sec) => hasToolHint(brief.markdown, sec)).length;
  const value = named / truncated.length;
  return {
    value,
    target: 1,
    passed: value === 1,
    details: `${named}/${truncated.length} sections tronquées nomment leur outil`,
  };
}

/* ------------------------------------------------------------------ */
/* 5 & 6. Fuites : injectionLeak et secretLeak sur le markdown         */
/* ------------------------------------------------------------------ */

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const normHaystack = normalizeComparable(haystack);
  const normNeedle = normalizeComparable(needle);
  if (!normNeedle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = normHaystack.indexOf(normNeedle, pos)) !== -1) {
    count += 1;
    pos += normNeedle.length;
  }
  return count;
}

const INSTRUCTION_PATTERNS = [
  /ignore.*(instructions|consignes)/i,
  /pousse.*sur.*main/i,
  /push.*to.*main/i,
  /developer.*mode/i,
  /system.*override/i,
];

function isInstructionLeak(leak: string): boolean {
  return INSTRUCTION_PATTERNS.some((pat) => pat.test(leak));
}

export function evaluateInjectionLeak(
  brief: BriefData,
  expected: ExpectedOutcome
): MetricEvaluation {
  const instructionLeakers = expected.mustNotAppear.filter(isInstructionLeak);
  const counts = instructionLeakers.reduce(
    (acc, needle) => acc + countOccurrences(brief.markdown, needle),
    0
  );
  return {
    value: counts,
    target: 0,
    passed: counts === 0,
    details: counts === 0 ? '0 fuite d’instruction' : `${counts} occurrences d’instruction`,
  };
}

export function evaluateSecretLeak(
  brief: BriefData,
  expected: ExpectedOutcome
): MetricEvaluation {
  const secretLeakers = expected.mustNotAppear.filter((s) => !isInstructionLeak(s));
  const counts = secretLeakers.reduce(
    (acc, needle) => acc + countOccurrences(brief.markdown, needle),
    0
  );
  return {
    value: counts,
    target: 0,
    passed: counts === 0,
    details: counts === 0 ? '0 fuite de secret' : `${counts} occurrences de secret`,
  };
}

/* ------------------------------------------------------------------ */
/* 7. gapRecall : trous attendus retrouvés / trous attendus            */
/* ------------------------------------------------------------------ */

export function evaluateGapRecall(
  score: ReadinessScore,
  expected: ExpectedOutcome
): MetricEvaluation {
  const expectedGaps = expected.gapsExpected ?? [];
  if (expectedGaps.length === 0) return { value: 1, target: 0.9, passed: true };
  const actualReasons = (score.gaps ?? []).map((g) =>
    normalizeComparable(`${g.criterion} ${g.reason}`)
  );
  const found = expectedGaps.filter((expectedSub) => {
    const normExpected = normalizeComparable(expectedSub);
    return actualReasons.some((actual) => actual.includes(normExpected));
  }).length;
  const value = found / expectedGaps.length;
  return {
    value,
    target: 0.9,
    passed: value >= 0.9,
    details: `${found}/${expectedGaps.length} trous retrouvés (${Math.round(value * 100)}%)`,
  };
}

/* ------------------------------------------------------------------ */
/* 8. readinessAccuracy : score.status === expected.readinessBucket   */
/* ------------------------------------------------------------------ */

export function evaluateReadinessAccuracy(
  score: ReadinessScore,
  expected: ExpectedOutcome
): MetricEvaluation {
  const match = score.status === expected.readinessBucket;
  return {
    value: match ? 1 : 0,
    target: 1,
    passed: match,
    details: `obtenu: « ${score.status} » vs attendu: « ${expected.readinessBucket} »`,
  };
}

/* ------------------------------------------------------------------ */
/* 9. staleFlagged : décisions > 18 mois marquées                     */
/* ------------------------------------------------------------------ */

/**
 * Décisions de plus de 18 mois (`STALE_DECISION_MONTHS`) marquées
 * « (ancienne, à confirmer) ». Seules les décisions anciennes **affichées**
 * dans le brief sont comptées : une décision ancienne coupée par la
 * troncature budgétaire n'a rien à marquer (la troncature est mesurée par
 * `truncationNamed`).
 */
export function evaluateStaleFlagged(
  brief: BriefData,
  fixture: FixtureSpec,
  now: Date = new Date()
): MetricEvaluation {
  const oldDecisions = (fixture.decisions ?? []).filter((d) => isStaleDecision(d.date, now));
  const applicable = brief.applicableDecisions ?? [];
  const shown = oldDecisions.filter((old) =>
    applicable.some((it) =>
      normalizeComparable(it.text).includes(normalizeComparable(old.title))
    )
  );
  if (shown.length === 0) return { value: 1, target: 1, passed: true };
  const flagged = shown.filter((old) => {
    const item = applicable.find((it) =>
      normalizeComparable(it.text).includes(normalizeComparable(old.title))
    );
    return Boolean(
      item &&
        (item.stale === true ||
          normalizeComparable(item.text).includes('ancienne a confirmer'))
    );
  }).length;
  const value = flagged / shown.length;
  return {
    value,
    target: 1,
    passed: value === 1,
    details: `${flagged}/${shown.length} décisions anciennes affichées marquées`,
  };
}

/* ------------------------------------------------------------------ */
/* 9b. holesRecall : trous attendus (section 9 du brief) retrouvés     */
/* ------------------------------------------------------------------ */

export function evaluateHolesRecall(
  brief: BriefData,
  expected: ExpectedOutcome
): MetricEvaluation {
  const holes = expected.holesExpected ?? [];
  if (holes.length === 0) return { value: 1, target: 0.9, passed: true };
  const joined = normalizeComparable((brief.gaps ?? []).join(' | '));
  const found = holes.filter((hole) =>
    joined.includes(normalizeComparable(hole))
  ).length;
  const value = found / holes.length;
  return {
    value,
    target: 0.9,
    passed: value >= 0.9,
    details: `${found}/${holes.length} trous (section 9) retrouvés (${Math.round(value * 100)}%)`,
  };
}

/* ------------------------------------------------------------------ */
/* Agrégat des indicateurs                                             */
/* ------------------------------------------------------------------ */

export function evaluateAllMetrics(
  brief: BriefData,
  score: ReadinessScore,
  fixture: FixtureSpec,
  now: Date = new Date()
): FidelityMetrics {
  return {
    sourcesCoverage: evaluateSourcesCoverage(brief),
    inventedItems: evaluateInventedItems(brief, fixture),
    budgetCompliance: evaluateBudgetCompliance(brief),
    truncationNamed: evaluateTruncationNamed(brief),
    injectionLeak: evaluateInjectionLeak(brief, fixture.expected),
    secretLeak: evaluateSecretLeak(brief, fixture.expected),
    gapRecall: evaluateGapRecall(score, fixture.expected),
    readinessAccuracy: evaluateReadinessAccuracy(score, fixture.expected),
    staleFlagged: evaluateStaleFlagged(brief, fixture, now),
    holesRecall: evaluateHolesRecall(brief, fixture.expected),
  };
}
