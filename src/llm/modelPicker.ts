/**
 * Choix du modèle de condensation (WP-llm).
 *
 * Règles :
 * - seul un modèle **`active`** est éligible (un modèle `deprecated` peut
 *   disparaître du jour au lendemain) ;
 * - à statut égal, on préfère le **plus rapide / le plus économique**
 *   (famille « haiku / mini / flash » devant « sonnet », devant « opus ») :
 *   la condensation est une tâche courte, répétée et bornée, la qualité d'un
 *   gros modèle n'apporte rien et coûterait du temps (55 s par action MCP) ;
 * - le choix est **mis en cache en mémoire** : `list()` n'est appelé qu'une
 *   fois par exécution, pas une fois par élément condensé ;
 * - si `list()` échoue ou ne propose aucun modèle actif, on retombe sur un
 *   **repli déterministe** (`FALLBACK_MODEL`) : jamais d'erreur remontée.
 */

import type { LlmModelInfo, LlmPort } from './types';

/** Repli déterministe quand la liste des modèles est indisponible. */
export const FALLBACK_MODEL = 'claude-haiku-4-5';

/**
 * Familles privilégiées : le manifeste déclare `model: [claude]`, donc un
 * modèle de cette famille est retenu en priorité si la plateforme en expose.
 */
export const PREFERRED_FAMILIES: readonly string[] = ['claude'];

/** Mots-clés de coût/vitesse, du plus économique au plus coûteux. */
const FAST_HINTS = ['haiku', 'mini', 'flash', 'nano', 'lite', 'small', 'turbo', 'fast'];
const HEAVY_HINTS = ['opus', 'pro', 'large', 'max', 'ultra', 'plus', 'premium'];

/** Rang de coût d'un nom de modèle : 0 = économique, 2 = lourd, 1 = intermédiaire. */
export function modelRank(name: string): number {
  const lower = (name ?? '').toLowerCase();
  if (FAST_HINTS.some((hint) => lower.includes(hint))) return 0;
  if (HEAVY_HINTS.some((hint) => lower.includes(hint))) return 2;
  return 1;
}

/** Vrai si le nom appartient à une famille privilégiée (déclarée au manifeste). */
export function isPreferredFamily(name: string, families: readonly string[] = PREFERRED_FAMILIES): boolean {
  const lower = (name ?? '').toLowerCase();
  return families.some((family) => lower.includes(family.toLowerCase()));
}

/**
 * Classement déterministe : famille privilégiée d'abord, puis du plus
 * économique au plus lourd, puis ordre alphabétique (stabilité garantie).
 */
export function compareModels(
  left: LlmModelInfo,
  right: LlmModelInfo,
  families: readonly string[] = PREFERRED_FAMILIES
): number {
  const byFamily = Number(isPreferredFamily(right.model, families)) - Number(isPreferredFamily(left.model, families));
  if (byFamily !== 0) return byFamily;
  const byRank = modelRank(left.model) - modelRank(right.model);
  if (byRank !== 0) return byRank;
  return left.model.localeCompare(right.model);
}

/** Modèles actifs uniquement, triés par préférence. */
export function activeModels(models: LlmModelInfo[] | undefined): LlmModelInfo[] {
  return (models ?? [])
    .filter((model) => model && typeof model.model === 'string' && model.model.trim() !== '')
    .filter((model) => model.status === 'active')
    .sort((left, right) => compareModels(left, right));
}

/**
 * Modèle retenu parmi une liste : le premier actif classé, `null` si aucun
 * modèle actif n'est proposé.
 */
export function pickModel(
  models: LlmModelInfo[] | undefined,
  families: readonly string[] = PREFERRED_FAMILIES
): string | null {
  const candidates = activeModels(models).sort((left, right) => compareModels(left, right, families));
  return candidates.length > 0 ? candidates[0].model : null;
}

/* ------------------------------------------------------------------ *
 * Cache mémoire (une résolution par exécution)
 * ------------------------------------------------------------------ */

let cachedModel: string | null = null;

/** Vide le cache : utilisé par les tests et par un changement de configuration. */
export function resetModelCache(): void {
  cachedModel = null;
}

/** Modèle en cache, `null` si aucune résolution n'a encore eu lieu. */
export function cachedModelName(): string | null {
  return cachedModel;
}

export interface ResolveModelOptions {
  families?: readonly string[];
  /** Repli déterministe si `list()` échoue (défaut : `FALLBACK_MODEL`). */
  fallback?: string;
}

/**
 * Résout le modèle à utiliser : cache d'abord, puis `list()`, puis repli
 * déterministe. **Ne lève jamais** : une panne de `list()` donne le repli.
 */
export async function resolveModel(port: LlmPort, options: ResolveModelOptions = {}): Promise<string> {
  if (cachedModel) return cachedModel;
  const fallback = options.fallback ?? FALLBACK_MODEL;
  let picked: string | null = null;
  try {
    const listed = await port.list();
    picked = pickModel(listed?.models, options.families);
  } catch {
    picked = null;
  }
  cachedModel = picked ?? fallback;
  return cachedModel;
}
