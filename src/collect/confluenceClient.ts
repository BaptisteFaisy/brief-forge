/**
 * Client Confluence de la collecte : pages étiquetées `decision` ou `adr`.
 *
 * La lecture est optionnelle : si l'app Forge n'est pas multi-produits,
 * `requestConfluence` échoue avant même la requête HTTP. On détecte ce cas
 * précis (`isConfluenceUnavailable`) pour que la collecte renvoie simplement
 * « aucune décision connue » au lieu de casser le brief.
 */

import { sanitizeTicketContent } from '../security';
import {
  asArray,
  asRecord,
  asString,
  dig,
  parseIsoDate,
  requestJson,
} from './settingsDefaults';
import type { ConfluenceClient, DecisionRecord, Transport } from './types';

const API = '/wiki/rest/api/content';
const PAGE_LIMIT = 25;
const EXPAND = 'body.storage,version,history,space';

export function createConfluenceClient(transport: Transport): ConfluenceClient {
  return {
    searchPagesByLabels: async (labels, issueKey) => {
      const cql = buildDecisionCql(labels, issueKey);
      const payload = asRecord(
        await requestJson(
          transport,
          `${API}/search?cql=${encodeURIComponent(cql)}&limit=${PAGE_LIMIT}&expand=${EXPAND}`,
          issueKey ?? 'confluence'
        )
      );
      return asArray(payload.results);
    },
    fetchPageContent: async (pageId) =>
      htmlToText(
        asString(
          dig(
            await requestJson(
              transport,
              `${API}/${encodeURIComponent(pageId)}?expand=${EXPAND}`,
              pageId
            ),
            'body',
            'storage',
            'value'
          )
        )
      ),
  };
}

/** CQL des pages de décision, restreinte au ticket quand il est fourni. */
export function buildDecisionCql(labels: string[], issueKey?: string): string {
  const safeLabels = labels
    .map((label) => label.trim().replace(/"/g, ''))
    .filter((label) => label !== '');
  const labelClause =
    safeLabels.length === 0
      ? 'type = page'
      : `label in (${safeLabels.map((label) => `"${label}"`).join(',')}) and type = page`;
  if (!issueKey || issueKey === '') return labelClause;
  return `${labelClause} and text ~ "${issueKey.replace(/"/g, '')}"`;
}

/** Transforme une page Confluence brute en `DecisionRecord` sourcé et daté. */
export function parseDecisionPage(value: unknown): DecisionRecord | undefined {
  const page = asRecord(value);
  const title = asString(page.title);
  const base = asString(dig(page, '_links', 'base'));
  const webui = asString(dig(page, '_links', 'webui'));
  const url = base !== '' && webui !== '' ? `${base}${webui}` : webui;
  if (title === '' || url === '') return undefined;
  const author =
    asString(dig(page, 'version', 'by', 'displayName')) ||
    asString(dig(page, 'history', 'createdBy', 'displayName')) ||
    'inconnu';
  const date =
    parseIsoDate(dig(page, 'version', 'when')) ||
    parseIsoDate(dig(page, 'history', 'createdDate'));
  const body = htmlToText(asString(dig(page, 'body', 'storage', 'value')));
  return {
    title,
    url,
    date,
    author,
    body: sanitizeTicketContent(body, author, date || 'date non précisée'),
  };
}

export function parseDecisionPages(values: unknown[]): DecisionRecord[] {
  return values
    .map(parseDecisionPage)
    .filter((decision): decision is DecisionRecord => decision !== undefined);
}

/**
 * Vrai si l'erreur signifie « Confluence indisponible pour cette app »
 * (app non multi-produits), et non un refus de droits utilisateur.
 */
export function isConfluenceUnavailable(error: unknown): boolean {
  const err = asRecord(error);
  const name = asString(err.name);
  const message = asString(err.message).toLowerCase();
  if (name === 'RequestProductNotAllowedError' || name === 'NotAllowedError') {
    return true;
  }
  if (name === 'PermissionDeniedError') return false;
  return (
    message.includes('multi-product') ||
    message.includes('multi product') ||
    message.includes('not enabled for this app') ||
    message.includes('does not have access to the product')
  );
}

/** Convertit du HTML de stockage Confluence en texte lisible. */
export function htmlToText(html: string): string {
  if (html === '') return '';
  const withBreaks = html
    .replace(/<\s*(br|hr)\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&[a-z#0-9]+;/gi, (entity) => {
    const known = ENTITIES[entity.toLowerCase()];
    if (known !== undefined) return known;
    const numeric = /^&#(\d+);$/.exec(entity);
    return numeric ? String.fromCharCode(Number(numeric[1])) : entity;
  });
}
