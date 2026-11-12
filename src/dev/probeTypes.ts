/**
 * Types et petits utilitaires partagés par la sonde de développement.
 * Extraits de `probe.ts` pour que les commandes additionnelles (fidélité sur
 * site réel, jeu de démo) ne dupliquent rien.
 */

export interface ProbeRequest {
  method: string;
  body: string;
  queryParameters: Record<string, string[]>;
}

export interface ProbeResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string[]>;
}

export interface JsonResponse {
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export function json(body: unknown, statusCode = 200): ProbeResponse {
  return {
    statusCode,
    headers: { 'Content-Type': ['application/json'] },
    body: JSON.stringify(body, null, 1),
  };
}

export function param(req: ProbeRequest, name: string, fallback = ''): string {
  const values = req.queryParameters?.[name];
  return values && values.length > 0 ? String(values[0]) : fallback;
}

export function intParam(req: ProbeRequest, name: string, fallback: number): number {
  const parsed = Number.parseInt(param(req, name, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Mesure une étape et renvoie [résultat, millisecondes]. */
export async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  const value = await run();
  return [value, Date.now() - started];
}

/** Clé de ticket validée (jamais d'entrée brute dans un chemin). */
export function issueKeyOf(req: ProbeRequest, name = 'issue'): string {
  const key = param(req, name, '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw new Error(`paramètre « ${name} » attendu (ex. PAY-6), reçu : « ${key} »`);
  }
  return key;
}
