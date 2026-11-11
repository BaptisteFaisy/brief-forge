import { Budget } from '../types';
import { BUDGET_TOKENS, DEFAULT_BUDGET } from '../config';
import { BriefError } from '../util/errors';

/**
 * Helpers partagés par les onze actions MCP.
 *
 * Deux principes :
 * 1. Les entrées d'une action sont extraites par un modèle et peuvent être
 *    inventées : elles sont validées ici, mais aucune décision de droits ne
 *    repose sur elles (l'identité vient du contexte de l'appel).
 * 2. Une action ne lève jamais une erreur brute vers le client MCP : elle
 *    renvoie une réponse explicite et lisible par l'agent.
 */

export interface ActionContext {
  accountId?: string;
  clientName?: string;
  cloudId?: string;
}

export class ActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionInputError';
  }
}

export function requireString(
  payload: Record<string, unknown> | undefined,
  key: string
): string {
  const value = payload?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ActionInputError(`Entrée manquante ou invalide : « ${key} » (chaîne attendue).`);
  }
  return value.trim();
}

export function optionalString(
  payload: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = payload?.[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ActionInputError(`Entrée invalide : « ${key} » (chaîne attendue).`);
  }
  return value.trim();
}

export function parseBudget(payload: Record<string, unknown> | undefined): Budget {
  const raw = optionalString(payload, 'budget');
  if (!raw) return DEFAULT_BUDGET;
  const value = raw.toLowerCase();
  if (value !== 's' && value !== 'm' && value !== 'l') {
    throw new ActionInputError(
      `Budget invalide : « ${raw} » (attendu : s, m ou l).`
    );
  }
  return value;
}

export function budgetTokens(budget: Budget): number {
  return BUDGET_TOKENS[budget];
}

export function accountFromContext(context: unknown): ActionContext {
  const raw = (context ?? {}) as Record<string, unknown>;
  const principal = (raw.principal ?? {}) as Record<string, unknown>;
  return {
    accountId:
      (raw.accountId as string | undefined) ??
      (principal.accountId as string | undefined) ??
      (raw.atlassianId as string | undefined),
    clientName: raw.clientName as string | undefined,
    cloudId: raw.cloudId as string | undefined,
  };
}

/**
 * Transforme une erreur en réponse MCP lisible : l'agent de code comprend le
 * refus et ne réessaie pas aveuglément.
 */
export function toActionResult(error: unknown): { ok: false; error: string; code: string } {
  if (error instanceof BriefError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof ActionInputError) {
    return { ok: false, error: error.message, code: 'INVALID_INPUT' };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: `Erreur interne : ${message}`, code: 'INTERNAL_ERROR' };
}

/** Enveloppe une action : validation, exécution, réponse explicite. */
export async function runAction<T>(
  name: string,
  body: () => Promise<T>
): Promise<T | { ok: false; error: string; code: string }> {
  try {
    return await body();
  } catch (error) {
    const result = toActionResult(error);
    console.error(`[action:${name}] ${result.code} — ${result.error}`);
    return result;
  }
}
