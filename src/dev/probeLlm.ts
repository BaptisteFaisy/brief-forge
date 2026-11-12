/**
 * `cmd=llm` — preuve directe que le modèle hébergé répond dans le runtime.
 *
 * Pourquoi une commande dédiée : sur le site de démo les tickets réels sont
 * courts, donc aucun élément ne dépasse le plafond de jetons par élément
 * (`ITEM_CAP_TOKENS` dans `src/brief/builder.ts`) et le moteur n'appelle jamais
 * le modèle. Un brief seul ne pouvait donc pas prouver que `@forge/llm`
 * fonctionne une fois déployé. Cette commande isole le chemin, dans l'ordre où
 * le moteur l'emprunte : liste des modèles, modèle résolu, complétion directe,
 * puis condensation réelle d'un texte long.
 *
 * Lecture seule : aucun ticket, aucun commentaire, aucune table n'est touché.
 */
import {
  FALLBACK_MODEL,
  activeModels,
  condenseSystemPrompt,
  condenseUserPrompt,
  createModelCondenser,
  defaultLlmClient,
  describeLlmError,
  forgeLlmPort,
  pickModel,
  resolveModel,
} from '../llm';
import { estimateTokens } from '../util/tokens';
import { intParam, json, param, timed } from './probeTypes';
import type { ProbeRequest, ProbeResponse } from './probeTypes';

/** Texte long de démonstration : aucune donnée de ticket, aucune date. */
function longSample(repetitions: number): string {
  const phrase =
    'Le traitement des remboursements doit rester idempotent : deux appels ' +
    "successifs sur la même écriture ne produisent qu'un seul mouvement de " +
    "journal, et chaque mouvement conserve la référence de la demande d'origine. ";
  return phrase.repeat(Math.max(1, repetitions));
}

/** Étape 1 : quels modèles le runtime expose-t-il ? */
async function listModels(report: Record<string, unknown>): Promise<void> {
  try {
    const [listed, ms] = await timed(() => defaultLlmClient().list());
    const models = listed?.models ?? [];
    const actifs = activeModels(models);
    report.listMs = ms;
    report.modelCount = models.length;
    report.activeCount = actifs.length;
    report.activeModels = actifs.map((modele) => modele.model).slice(0, 10);
    report.picked = pickModel(models);
  } catch (error) {
    report.listError = describeLlmError(error);
  }
}

/** Étape 2 : le modèle que le moteur résout réellement, et son repli. */
async function resolvedModel(report: Record<string, unknown>): Promise<void> {
  report.fallbackModel = FALLBACK_MODEL;
  try {
    const [name, ms] = await timed(() => resolveModel(forgeLlmPort()));
    report.resolvedModel = name;
    report.resolveMs = ms;
  } catch (error) {
    report.resolveError = describeLlmError(error);
  }
}

/** Étape 3 : complétion directe, hors moteur de brief. */
async function directCompletion(
  report: Record<string, unknown>,
  text: string,
  budgetTokens: number
): Promise<void> {
  try {
    const [answer, ms] = await timed(() =>
      defaultLlmClient().complete(
        condenseSystemPrompt(),
        condenseUserPrompt(text, budgetTokens),
        96
      )
    );
    report.completeMs = ms;
    report.completeAnswer = answer === null ? null : answer.slice(0, 400);
  } catch (error) {
    report.completeError = describeLlmError(error);
  }
}

/** Étape 4 : condensation exactement comme le moteur de brief l'appelle. */
async function condensation(
  report: Record<string, unknown>,
  text: string,
  budgetTokens: number
): Promise<void> {
  const condense = createModelCondenser();
  const [out, ms] = await timed(() => condense({ text, budgetTokens, keepSources: true }));
  report.condenseMs = ms;
  report.inputChars = text.length;
  report.inputTokens = estimateTokens(text);
  report.outputChars = out.length;
  report.outputTokens = estimateTokens(out);
  report.condensed = out.trim() !== text.trim();
  report.output = out.slice(0, 600);
}

/** `cmd=llm&repeats=12&budget=60&text=…` — état réel du chemin modèle. */
export async function cmdLlm(req: ProbeRequest): Promise<ProbeResponse> {
  const budgetTokens = intParam(req, 'budget', 60);
  const text = param(req, 'text', '') || longSample(intParam(req, 'repeats', 12));
  const report: Record<string, unknown> = { cmd: 'llm', budgetTokens };

  await listModels(report);
  await resolvedModel(report);
  await directCompletion(report, text, budgetTokens);
  await condensation(report, text, budgetTokens);

  report.ok = report.condensed === true || report.completeAnswer != null;
  return json(report);
}
