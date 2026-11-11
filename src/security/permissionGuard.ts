/**
 * Contrôle d'accès (BC-09) : ne jamais dépasser les droits de l'utilisateur
 * appelant.
 *
 * Principe : avant de répondre quoi que ce soit sur un ticket, on **relit le
 * ticket au nom de l'utilisateur appelant** (`asUser`). Si la lecture échoue ou
 * si l'identité est inconnue, on refuse : aucune donnée du ticket ne sort, et le
 * refus est explicite (`PermissionDeniedError`).
 *
 * L'identité vient **exclusivement du contexte de l'appel** fourni par Forge.
 * Elle ne doit jamais être lue dans les entrées de l'outil : celles-ci peuvent
 * être inventées par le modèle. `resolveCallerAccountId` ne lit donc que des
 * champs de contexte, et `assertIssueAccessFromContext` ignore tout payload.
 */
import api, { route } from '@forge/api';
import { PermissionDeniedError } from '../util/errors';

/** Clé de ticket Jira acceptée. Sert aussi à empêcher toute injection de chemin. */
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,31}-\d{1,9}$/;

/** Résultat d'une sonde de lecture du ticket. */
export interface AccessProbe {
  ok: boolean;
  status: number;
}

export type AccessVerdict = 'autorise' | 'refuse' | 'indetermine';

/** Lecture d'un ticket au nom d'un utilisateur. Injectable pour les tests. */
export type IssueFetcher = (issueKey: string, accountId: string) => Promise<AccessProbe>;

export interface PermissionDeps {
  fetchIssue?: IssueFetcher;
}

export interface AccessDecision {
  verdict: AccessVerdict;
  issueKey: string;
  accountId: string | null;
}

/**
 * Lit l'identité de l'appelant dans le contexte Forge.
 * N'accepte que des champs de contexte : jamais un payload d'outil.
 */
export function resolveCallerAccountId(context: unknown): string | null {
  if (!context || typeof context !== 'object') return null;
  const source = context as Record<string, unknown>;
  const direct = pickNonEmpty(source.accountId);
  if (direct) return direct;
  const principal = source.principal;
  if (principal && typeof principal === 'object') {
    const nested = pickNonEmpty((principal as Record<string, unknown>).accountId);
    if (nested) return nested;
  }
  return pickNonEmpty(source.userAccountId);
}

function pickNonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Traduit une réponse de lecture en verdict d'accès (fail-safe sur le doute). */
export function classifyAccessResponse(probe: AccessProbe | null | undefined): AccessVerdict {
  if (!probe) return 'indetermine';
  if (probe.ok) return 'autorise';
  if (probe.status === 401 || probe.status === 403 || probe.status === 404) return 'refuse';
  return 'indetermine';
}

/** Vrai si la clé de ticket a une forme sûre. */
export function isSafeIssueKey(issueKey: string): boolean {
  return typeof issueKey === 'string' && ISSUE_KEY_PATTERN.test(issueKey.trim());
}

/**
 * Lit le ticket au nom de l'utilisateur appelant.
 * Ne renvoie que le code de statut : aucun contenu du ticket n'est conservé.
 */
async function fetchIssueAsUser(issueKey: string, accountId: string): Promise<AccessProbe> {
  const response = await api
    .asUser(accountId)
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`);
  return { ok: response.ok === true, status: response.status };
}

/**
 * Décide de l'accès sans lever d'erreur. Toute incertitude vaut refus.
 */
export async function checkIssueAccess(
  issueKey: string,
  accountId?: string,
  deps: PermissionDeps = {}
): Promise<AccessDecision> {
  const key = typeof issueKey === 'string' ? issueKey.trim() : '';
  const caller = pickNonEmpty(accountId);
  if (!isSafeIssueKey(key) || !caller) {
    return { verdict: 'refuse', issueKey: key, accountId: caller };
  }
  const fetchIssue = deps.fetchIssue ?? fetchIssueAsUser;
  try {
    const probe = await fetchIssue(key, caller);
    return { verdict: classifyAccessResponse(probe), issueKey: key, accountId: caller };
  } catch {
    return { verdict: 'indetermine', issueKey: key, accountId: caller };
  }
}

/**
 * Vérifie l'accès ou lève `PermissionDeniedError` (contrat § 4.5).
 * `accountId` doit venir du contexte de l'appel, jamais d'une entrée d'outil.
 */
export async function assertIssueAccess(
  issueKey: string,
  accountId?: string,
  deps: PermissionDeps = {}
): Promise<void> {
  const decision = await checkIssueAccess(issueKey, accountId, deps);
  if (decision.verdict !== 'autorise') {
    throw new PermissionDeniedError(decision.issueKey || String(issueKey));
  }
}

/**
 * Point d'entrée recommandé pour les handlers : l'identité est résolue depuis le
 * contexte Forge, et tout autre argument est ignoré (anti-usurpation).
 */
export async function assertIssueAccessFromContext(
  issueKey: string,
  context: unknown,
  deps: PermissionDeps = {}
): Promise<void> {
  await assertIssueAccess(issueKey, resolveCallerAccountId(context) ?? undefined, deps);
}
