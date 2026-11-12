/**
 * Client MCP minimal : JSON-RPC 2.0 sur le transport « Streamable HTTP ».
 *
 * Ce module ne sait rien de brief-forge : il implémente la négociation
 * (`initialize` → `notifications/initialized` → `tools/list` → `tools/call`),
 * la découverte OAuth publiée par le serveur (RFC 9728 pour la ressource
 * protégée, RFC 8414 pour le serveur d'autorisation) et la traduction d'un
 * statut HTTP en verdict honnête (échec technique ou étape humaine).
 */
import { createHash, randomBytes } from 'node:crypto';

import { getJson, httpRequest, parsePayload } from './http.mjs';
import { EXIT_HUMAN, EXIT_OK, EXIT_TECH, truncate } from './output.mjs';

export const MCP_ORIGIN = 'https://mcp.atlassian.com';
export const PROTOCOL_VERSION = '2025-06-18';
export const CLIENT_INFO = { name: 'brief-forge-mcp-e2e', version: '1.0.0' };

/** Point d'accès MCP d'une app Forge : `https://mcp.atlassian.com/forge/<appId>`. */
export function endpointFor(appId, override = '') {
  return override || `${MCP_ORIGIN}/forge/${appId}`;
}

export function rpcMessage(method, params, id) {
  const message = { jsonrpc: '2.0', method };
  if (params !== undefined) message.params = params;
  if (id !== undefined) message.id = id;
  return message;
}

export function initParams() {
  return { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO };
}

/** POST JSON-RPC : gère l'en-tête de session et la réponse SSE ou JSON. */
export async function mcpPost(endpoint, message, ctx) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
  if (ctx.sessionId) headers['Mcp-Session-Id'] = ctx.sessionId;
  const res = await httpRequest(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
    timeoutMs: ctx.timeoutMs,
  });
  return {
    status: res.status,
    text: res.text,
    challenge: res.headers.get('www-authenticate') || '',
    sessionId: res.headers.get('mcp-session-id') || ctx.sessionId || '',
    payload: parsePayload(res.text, res.headers.get('content-type')),
  };
}

/** Traduit un statut HTTP en verdict : étape humaine ou échec technique. */
export function classifyStatus(response) {
  if (response.status === 401) {
    return { exit: EXIT_HUMAN, reason: '401 : jeton absent ou refusé — le consentement OAuth navigateur est requis.' };
  }
  if (response.status === 403) {
    return { exit: EXIT_HUMAN, reason: '403 : exposition externe probablement non activée par l’administrateur du site.' };
  }
  if (response.status === 404) {
    return { exit: EXIT_TECH, reason: '404 : point d’accès introuvable — app non déployée ou appId erroné.' };
  }
  if (response.status >= 500) return { exit: EXIT_TECH, reason: `${response.status} : erreur serveur.` };
  if (response.status >= 400) {
    return { exit: EXIT_TECH, reason: `${response.status} : ${truncate(response.text, 200)}` };
  }
  return null;
}

/** `initialize` puis notification `notifications/initialized` : renvoie la session. */
export async function handshake(endpoint, token, timeoutMs) {
  const response = await mcpPost(endpoint, rpcMessage('initialize', initParams(), 1), { token, timeoutMs });
  const failure = classifyStatus(response);
  if (failure) return failure;
  const result = (response.payload || {}).result || {};
  if (!result.serverInfo) {
    return { exit: EXIT_TECH, reason: `réponse d’initialisation illisible : ${truncate(response.text, 200)}` };
  }
  const sessionId = response.sessionId;
  if (sessionId) {
    await mcpPost(endpoint, rpcMessage('notifications/initialized'), { token, sessionId, timeoutMs });
  }
  return { exit: EXIT_OK, sessionId, serverInfo: result.serverInfo, protocolVersion: result.protocolVersion };
}

export async function listTools(endpoint, token, sessionId, timeoutMs) {
  const response = await mcpPost(endpoint, rpcMessage('tools/list', {}, 2), { token, sessionId, timeoutMs });
  const failure = classifyStatus(response);
  if (failure) return failure;
  const tools = ((response.payload || {}).result || {}).tools;
  if (!Array.isArray(tools)) {
    return { exit: EXIT_TECH, reason: `tools/list illisible : ${truncate(response.text, 200)}` };
  }
  return { exit: EXIT_OK, tools };
}

export function callTool(endpoint, token, sessionId, name, args, timeoutMs, id = 3) {
  return mcpPost(endpoint, rpcMessage('tools/call', { name, arguments: args || {} }, id), {
    token,
    sessionId,
    timeoutMs,
  });
}

/** Extrait la charge utile d'un résultat `tools/call` (texte JSON ou non). */
export function unwrapToolResult(response) {
  const payload = response.payload || {};
  if (payload.error) {
    return { isError: true, text: payload.error.message || JSON.stringify(payload.error), json: null };
  }
  const result = payload.result || {};
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { isError: result.isError === true, text, json };
}

/* ------------------------------------------------------------------ */
/* Découverte OAuth (sans jeton)                                        */
/* ------------------------------------------------------------------ */

/** URL des métadonnées de ressource, tirée de `WWW-Authenticate` (RFC 9728). */
export function resourceMetadataUrl(challenge, endpoint) {
  const quoted = /resource_metadata="([^"]+)"/i.exec(challenge || '');
  if (quoted) return quoted[1];
  const bare = /resource_metadata=([^\s,]+)/i.exec(challenge || '');
  if (bare) return bare[1];
  const path = new URL(endpoint).pathname;
  return `${MCP_ORIGIN}/.well-known/oauth-protected-resource${path}`;
}

/** Candidats d'URL de métadonnées du serveur d'autorisation (RFC 8414). */
export function asMetadataCandidates(serverUrl) {
  const url = new URL(serverUrl);
  const path = url.pathname === '/' ? '' : url.pathname;
  return [
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    `${url.origin}/.well-known/oauth-authorization-server`,
    `${url.origin}${path}/.well-known/oauth-authorization-server`,
  ];
}

/** Première URL lisible parmi les candidates (les serveurs varient). */
export async function firstReadable(urls, timeoutMs) {
  for (const url of urls) {
    const res = await getJson(url, timeoutMs);
    if (res.ok && res.json) return { url, json: res.json };
  }
  return null;
}

/** PKCE S256 : le script prépare l'URL, l'humain valide dans le navigateur. */
export function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** État anti-CSRF de la demande d'autorisation (valeur jetable). */
export function randomState() {
  return randomBytes(8).toString('hex');
}
