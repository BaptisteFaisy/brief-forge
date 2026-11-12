/**
 * Garde de temps partagée.
 *
 * Une action MCP dispose de 55 s (contrat § 4.6) et le consumer de file vise
 * moins de 2 min pour les trois budgets : tout appel sortant (modèle, collecte)
 * doit donc être borné. `withTimeout` rejette au-delà du délai sans annuler le
 * travail sous-jacent (le runtime Forge ne propose pas d'annulation).
 */

export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`délai dépassé après ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** Borne une promesse dans le temps : rejette avec `TimeoutError` au-delà. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
