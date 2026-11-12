/**
 * HTTP minimal partagé (Node natif : `fetch`, aucune dépendance npm).
 *
 * Deux particularités utiles pour parler à Atlassian :
 *  - le transport MCP « Streamable HTTP » peut répondre en JSON simple **ou**
 *    en flux SSE (`text/event-stream`, lignes `data: …`) : `parsePayload`
 *    accepte les deux ;
 *  - toute requête est bornée dans le temps (`AbortSignal.timeout`) pour qu'un
 *    serveur muet produise un échec technique net plutôt qu'un script pendu.
 */

/** Requête HTTP bornée : renvoie statut, corps texte et en-têtes. */
export async function httpRequest(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs) });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

/** Lit un corps JSON, y compris dans un flux SSE (dernier message lisible). */
export function parsePayload(text, contentType) {
  if ((contentType || '').includes('text/event-stream')) {
    const frames = text
      .split(/\r?\n/)
      .filter((row) => row.startsWith('data:'))
      .map((row) => row.slice(5).trim());
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(frames[index]);
      } catch {
        /* on remonte jusqu’au dernier message lisible */
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET JSON : renvoie `{ status, ok, json, text }`. */
export async function getJson(url, timeoutMs) {
  const res = await httpRequest(url, { method: 'GET', headers: { Accept: 'application/json' }, timeoutMs });
  return {
    status: res.status,
    ok: res.status >= 200 && res.status < 300,
    json: parsePayload(res.text, res.headers.get('content-type')),
    text: res.text,
  };
}
