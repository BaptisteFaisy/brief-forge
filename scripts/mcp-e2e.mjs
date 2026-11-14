#!/usr/bin/env node
/**
 * Test de bout en bout du serveur MCP de « Brief de contexte » (brief-forge).
 *
 * Client MCP minimal en JSON-RPC 2.0 sur HTTP, **sans dépendance npm** :
 * `fetch`, `node:crypto` et `node:fs` du runtime Node suffisent (Node ≥ 18).
 * Le protocole et la découverte OAuth vivent dans `scripts/lib/`.
 *
 * Modes, qui séparent ce que la machine prouve seule de ce qui exige un
 * humain (consentement OAuth dans un navigateur, activation administrative de
 * l'exposition externe) :
 *
 *   --discovery   documents `.well-known` publics, SANS jeton (RFC 9728 pour
 *                 la ressource protégée, RFC 8414 pour le serveur
 *                 d'autorisation). Vérifiable immédiatement, sur tout poste.
 *   --probe       (avec --discovery) joue aussi l'ÉTAPE 0 : POST sans jeton
 *                 pour lire le défi `401 + WWW-Authenticate` réel.
 *   --auth-url    imprime l'URL de consentement à ouvrir (PKCE généré ici).
 *   --selftest    contrôle hors ligne du lecteur de manifeste et du comparateur
 *                 d'outils : aucun réseau, aucune dépendance.
 *   --check       initialize → tools/list, puis contrôle des 11 noms d'outils
 *                 et de leurs schémas d'entrées contre `manifest.yml`.
 *   --run         (défaut) initialize → tools/list → tools/call
 *                 check-readiness → tools/call get-work-brief, avec contrôle
 *                 des invariants du produit.
 *   --refusal     écriture sans identité : refus attendu, zéro écriture.
 *   --bc09        utilisateur sans accès au ticket : refus **sans contenu**.
 *
 * Jeton : variable d'environnement `MCP_TOKEN` ou `--token-file <chemin>`.
 * Jamais en argument de ligne de commande (il resterait dans `ps` et dans
 * l'historique du shell), jamais écrit dans le dépôt.
 *
 * Codes de sortie : 0 = vérifications passées, 1 = échec technique,
 * 2 = bloqué sur une étape humaine. Aucun échec n'est masqué.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  asMetadataCandidates,
  callTool,
  endpointFor,
  firstReadable,
  handshake,
  initParams,
  listTools,
  mcpPost,
  pkcePair,
  randomState,
  resourceMetadataUrl,
  rpcMessage,
  unwrapToolResult,
} from './lib/mcpClient.mjs';
import { compareTools, parseManifest, printComparison, selfTestCompare } from './lib/manifestTools.mjs';
import { checkBriefPayload, checkReadinessPayload } from './lib/briefChecks.mjs';
import { getJson } from './lib/http.mjs';
import {
  EXIT_HUMAN,
  EXIT_OK,
  EXIT_TECH,
  blocked,
  info,
  ko,
  line,
  ok,
  step,
  technical,
  truncate,
} from './lib/output.mjs';
import { alerteJeton, corpsRefresh, lireJetonStocke } from './lib/tokenStore.mjs';

const DEFAULT_APP_ID = '08a89a5d-94d0-448f-8c1a-70f938b2c3a8';
const DEFAULT_TIMEOUT_MS = 20000;
/** Le contrat d'acceptation expose onze outils MCP (voir `docs/CONTRACT.md`). */
const EXPECTED_TOOL_COUNT = 11;

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

const MODE_FLAGS = {
  '--discovery': 'discovery',
  '--auth-url': 'auth-url',
  '--selftest': 'selftest',
  '--check': 'check',
  '--run': 'run',
  '--refusal': 'refusal',
  '--bc09': 'bc09',
};

const VALUE_FLAGS = {
  '--app-id': (o, v) => { o.appId = v; },
  '--endpoint': (o, v) => { o.endpoint = v; },
  '--issue': (o, v) => { o.issue = v; },
  '--private-issue': (o, v) => { o.privateIssue = v; },
  '--budget': (o, v) => { o.budget = v; },
  '--manifest': (o, v) => { o.manifest = v; },
  '--token-file': (o, v) => { o.tokenFile = v; },
  '--expect-absent': (o, v) => { o.expectAbsent.push(v); },
  '--timeout': (o, v) => { o.timeoutMs = Number(v); },
};

/** Drapeaux sans valeur. */
const SWITCH_FLAGS = { '--probe': (o) => { o.probe = true; } };

function defaultOptions() {
  return {
    mode: 'run',
    appId: process.env.MCP_APP_ID || DEFAULT_APP_ID,
    endpoint: process.env.MCP_ENDPOINT || '',
    issue: process.env.MCP_ISSUE || 'PAY-123',
    privateIssue: process.env.MCP_PRIVATE_ISSUE || '',
    budget: 's',
    manifest: 'manifest.yml',
    tokenFile: '',
    expectAbsent: [],
    probe: false,
    timeoutMs: Number(process.env.MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function parseArgs(argv) {
  const opts = defaultOptions();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(EXIT_OK);
    }
    if (arg === '--token' || arg.startsWith('--token=')) refuseTokenArgument();
    if (MODE_FLAGS[arg]) {
      opts.mode = MODE_FLAGS[arg];
      continue;
    }
    if (SWITCH_FLAGS[arg]) {
      SWITCH_FLAGS[arg](opts);
      continue;
    }
    const setter = VALUE_FLAGS[arg];
    if (!setter) usageError(`option inconnue : ${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) usageError(`valeur manquante pour ${arg}`);
    setter(opts, value);
    index += 1;
  }
  opts.endpoint = endpointFor(opts.appId, opts.endpoint);
  return opts;
}

function refuseTokenArgument() {
  ko('refus : un jeton ne se passe jamais en argument (il resterait dans `ps` et dans l’historique).');
  ko('      utilisez MCP_TOKEN=<jeton> ou --token-file <chemin hors du dépôt>.');
  process.exit(EXIT_TECH);
}

function usageError(message) {
  ko(message);
  line('');
  printUsage();
  process.exit(EXIT_TECH);
}

function printUsage() {
  line('Usage : node scripts/mcp-e2e.mjs [mode] [options]');
  line('');
  line('Modes :');
  line('  --discovery      les deux documents .well-known publics, sans jeton');
  line('  --auth-url       URL de consentement OAuth à ouvrir (PKCE généré ici)');
  line('  --selftest       contrôle hors ligne du lecteur de manifeste (aucun réseau)');
  line('  --check          contrôle des outils exposés contre manifest.yml');
  line('  --run            initialize → tools/list → check-readiness → get-work-brief');
  line('  --refusal        écriture sans identité : refus attendu');
  line('  --bc09           utilisateur sans accès : refus sans contenu');
  line('');
  line('Options :');
  line('  --probe              joue aussi l’ÉTAPE 0 : POST sans jeton pour lire le défi 401');
  line('  --app-id <uuid>        app.id Forge (défaut : app de démonstration)');
  line('  --endpoint <url>       point d’accès MCP (défaut : …/forge/<appId>)');
  line('  --issue <KEY>          ticket de la démo (défaut : PAY-123)');
  line('  --private-issue <KEY>  ticket inaccessible à l’utilisateur du jeton');
  line('  --budget <s|m|l>       budget du brief (défaut : s)');
  line('  --manifest <chemin>    manifeste de référence (défaut : manifest.yml)');
  line('  --token-file <chemin>  fichier contenant le jeton (hors dépôt)');
  line('  --expect-absent <txt>  texte qui ne doit PAS apparaître (répétable)');
  line('  --timeout <ms>         délai par requête (défaut : 20000)');
  line('');
  line('Jeton : variable d’environnement MCP_TOKEN, ou --token-file <chemin>.');
  line('Codes de sortie : 0 = vérifications passées, 1 = échec technique, 2 = étape humaine.');
}

/**
 * Le jeton ne vient que de l'environnement ou d'un fichier hors dépôt. La forme
 * du fichier (JSON de la réponse d'autorisation, ou jeton brut) est lue par la
 * règle partagée `lireJetonStocke` ; son contenu ne remonte jamais dans un
 * message — un jeton dans une sortie, c'est une fuite.
 */
function readToken(opts) {
  if (opts.tokenFile) {
    const stocke = lireJetonStocke(resolve(opts.tokenFile));
    const token = String((stocke && stocke.access_token) || '').trim();
    if (token === '') {
      usageError(`aucun jeton exploitable dans ${opts.tokenFile} (attendu : jeton brut ou JSON avec « access_token »)`);
    }
    refuserJetonPerime(stocke, opts.tokenFile);
    return { token, source: `le fichier ${opts.tokenFile}` };
  }
  const fromEnv = (process.env.MCP_TOKEN || '').trim();
  if (fromEnv !== '') return { token: fromEnv, source: 'la variable d’environnement MCP_TOKEN' };
  return null;
}

/**
 * Écarter un jeton périmé avant d'appeler : un 401 compris n'est pas un 401
 * subi (« le chemin asUser est cassé ») — l'erreur du 12 novembre, payée une
 * journée. Code 1 si le fichier permet de se renouveler sans humain, 2 sinon.
 * Un jeton non daté n'est pas jugé : la preuve reste un appel réel.
 */
function refuserJetonPerime(stocke, chemin) {
  const alerte = alerteJeton(stocke, Date.now());
  if (alerte === '') return;
  line('');
  const message = `${alerte} — fichier ${chemin}`;
  process.exit(corpsRefresh(stocke) ? technical(message) : blocked(message));
}

/* ------------------------------------------------------------------ */
/* Découverte OAuth (sans jeton)                                        */
/* ------------------------------------------------------------------ */

function printField(label, value) {
  if (value === undefined || value === null || value === '') {
    info(`${label} : (non annoncé)`);
    return;
  }
  info(`${label} : ${Array.isArray(value) ? value.join(', ') : String(value)}`);
}

/** ÉTAPE 0 (`--probe`) : le défi `401 + WWW-Authenticate` du point d'accès. */
async function probeChallenge(opts) {
  step(`ÉTAPE 0 — POST ${opts.endpoint} (sans jeton)`);
  const probe = await mcpPost(opts.endpoint, rpcMessage('initialize', initParams(), 1), {
    timeoutMs: opts.timeoutMs,
  });
  info(`statut HTTP : ${probe.status}`);
  info(`WWW-Authenticate : ${probe.challenge || '(absent)'}`);
  info(`corps : ${truncate(probe.text, 240)}`);
  if (probe.status === 403) {
    return { exit: blocked('403 : l’exposition externe n’est pas activée par l’administrateur du site.') };
  }
  if (probe.status !== 401) {
    return { exit: technical(`réponse inattendue : sans jeton, le point d’accès doit répondre 401 (reçu ${probe.status}).`) };
  }
  ok('401 + défi OAuth : le point d’accès est publié et négocie (RFC 9728).');
  return { challenge: probe.challenge };
}

async function runDiscovery(opts) {
  if (opts.tokenFile || process.env.MCP_TOKEN) {
    info('jeton présent : il est IGNORÉ, la découverte est volontairement sans jeton.');
  }
  let challenge = '';
  if (opts.probe) {
    const probed = await probeChallenge(opts);
    if (probed.exit !== undefined) return probed.exit;
    challenge = probed.challenge;
  } else {
    info('ÉTAPE 0 non jouée : l’URL des métadonnées est déduite du point d’accès.');
    info(`  (ajoutez --probe pour lire le vrai WWW-Authenticate : POST ${opts.endpoint} sans jeton)`);
  }

  const resourceUrl = resourceMetadataUrl(challenge, opts.endpoint);
  step(`ÉTAPE 1/2 — GET ${resourceUrl}`);
  const resource = await getJson(resourceUrl, opts.timeoutMs);
  if (!resource.ok || !resource.json) {
    return technical(`métadonnées de ressource illisibles (statut ${resource.status}) : ${truncate(resource.text, 200)}`);
  }
  printField('resource', resource.json.resource);
  printField('authorization_servers', resource.json.authorization_servers);
  printField('scopes_supported', resource.json.scopes_supported);
  printField('bearer_methods_supported', resource.json.bearer_methods_supported);
  const servers = resource.json.authorization_servers || [];
  if (servers.length === 0) return technical('aucun serveur d’autorisation annoncé : découverte OAuth incomplète.');

  step(`ÉTAPE 2/2 — métadonnées du serveur d’autorisation ${servers[0]}`);
  const as = await firstReadable(asMetadataCandidates(servers[0]), opts.timeoutMs);
  if (!as) return technical('aucune URL .well-known/oauth-authorization-server lisible pour ce serveur.');
  info(`URL retenue : ${as.url}`);
  printField('issuer', as.json.issuer);
  printField('authorization_endpoint', as.json.authorization_endpoint);
  printField('token_endpoint', as.json.token_endpoint);
  printField('registration_endpoint', as.json.registration_endpoint);
  printField('scopes_supported', as.json.scopes_supported);
  printField('grant_types_supported', as.json.grant_types_supported);
  printField('code_challenge_methods_supported', as.json.code_challenge_methods_supported);
  line('');
  ok('découverte OAuth complète : scopes, serveur d’autorisation et méthodes bearer sont annoncés.');
  line('  La suite du protocole exige un humain :');
  line('    1. activation admin de l’exposition externe (si le site l’exige)');
  line('    2. consentement OAuth 2.1 dans un navigateur');
  line('    3. jeton transmis via MCP_TOKEN ou --token-file');
  return EXIT_OK;
}

/** Aide-mémoire : l'URL de consentement que le client MCP ouvre normalement. */
async function runAuthUrl(opts) {
  const resource = await getJson(resourceMetadataUrl('', opts.endpoint), opts.timeoutMs);
  const server = ((resource.json || {}).authorization_servers || [])[0];
  const as = server ? await firstReadable(asMetadataCandidates(server), opts.timeoutMs) : null;
  if (!as || !as.json.authorization_endpoint) {
    return technical('serveur d’autorisation introuvable ou sans `authorization_endpoint`.');
  }
  const { verifier, challenge } = pkcePair();
  const url = new URL(as.json.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', '<CLIENT_ID>');
  url.searchParams.set('redirect_uri', '<REDIRECT_URI>');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', ((resource.json || {}).scopes_supported || []).join(' '));
  url.searchParams.set('resource', opts.endpoint);
  url.searchParams.set('state', randomState());
  step('URL de consentement à ouvrir dans un navigateur');
  line(url.toString());
  line('');
  info(`verificateur PKCE (gardé côté client, jamais dans le dépôt) : ${verifier}`);
  info('En pratique c’est le client MCP (Claude Code, Cursor) qui mène cette danse et');
  info('stocke le jeton : ce mode sert à un client maison ou à un débogage.');
  return EXIT_HUMAN;
}

/* ------------------------------------------------------------------ */
/* Auto-contrôle hors ligne                                             */
/* ------------------------------------------------------------------ */

/** Vérifie le lecteur de manifeste et le comparateur, sans aucun réseau. */
function runSelfTest(opts) {
  step(`Auto-contrôle hors ligne — lecture de ${opts.manifest}`);
  const manifest = parseManifest(readFileSync(resolve(opts.manifest), 'utf8'));
  info(`${manifest.actions.length} actions lues, ${manifest.mcpTools.length} outils dans le module rovo:mcp`);
  for (const action of manifest.actions) {
    const inputs = action.inputs.map((input) => `${input.name}${input.required ? '*' : ''}:${input.type}`);
    line(`    · ${action.key} (${inputs.join(', ') || 'aucune entrée'})`);
  }
  const result = selfTestCompare(manifest);
  step('Auto-contrôle du comparateur');
  if (result.cleanOk) ok('liste fidèle au manifeste : aucun écart signalé.');
  else ko('liste fidèle au manifeste : le comparateur signale des écarts à tort.');
  if (result.brokenDetected) ok(`liste abîmée : ${result.brokenDiffs.length} écart(s) détecté(s), comme attendu.`);
  else ko('liste abîmée : aucun écart détecté — le comparateur est aveugle.');
  if (result.installationsOk) {
    ok('même app sur deux installations : les outils suffixés par l’environnement ne sont pas des écarts.');
  } else {
    ko('même app sur deux installations : les outils suffixés par l’environnement sont pris pour des écarts.');
  }
  if (result.strangerDetected) ok('outil inconnu : l’écart est bien détecté.');
  else ko('outil inconnu : aucun écart détecté — le comparateur accepte n’importe quoi.');
  if (manifest.mcpTools.length === EXPECTED_TOOL_COUNT) ok(`${EXPECTED_TOOL_COUNT} outils exposés, comme le contrat l’exige.`);
  else ko(`le manifeste expose ${manifest.mcpTools.length} outils, le contrat en exige ${EXPECTED_TOOL_COUNT}.`);
  const passed =
    result.cleanOk &&
    result.brokenDetected &&
    result.installationsOk &&
    result.strangerDetected &&
    manifest.mcpTools.length === EXPECTED_TOOL_COUNT;
  return passed ? EXIT_OK : EXIT_TECH;
}

/* ------------------------------------------------------------------ */
/* Modes avec jeton                                                     */
/* ------------------------------------------------------------------ */

/** Un verdict de session/liste traduit en code de sortie, message imprimé. */
function verdictOf(result) {
  return result.exit === EXIT_HUMAN ? blocked(result.reason) : technical(result.reason);
}

async function runCheck(opts, token) {
  const manifest = parseManifest(readFileSync(resolve(opts.manifest), 'utf8'));
  step('Référence : manifeste');
  info(`${manifest.actions.length} actions déclarées, ${manifest.mcpTools.length} outils dans le module rovo:mcp`);
  const session = await handshake(opts.endpoint, token, opts.timeoutMs);
  if (session.exit !== EXIT_OK) return verdictOf(session);
  info(`serveur : ${session.serverInfo.name} ${session.serverInfo.version || ''}`);
  const listed = await listTools(opts.endpoint, token, session.sessionId, opts.timeoutMs);
  if (listed.exit !== EXIT_OK) return verdictOf(listed);
  const report = compareTools(listed.tools, manifest);
  printComparison(report);
  return report.ok ? EXIT_OK : EXIT_TECH;
}

async function runCalls(opts, token) {
  const session = await handshake(opts.endpoint, token, opts.timeoutMs);
  if (session.exit !== EXIT_OK) return verdictOf(session);
  const listed = await listTools(opts.endpoint, token, session.sessionId, opts.timeoutMs);
  if (listed.exit !== EXIT_OK) return verdictOf(listed);
  info(`${listed.tools.length} outils listés`);
  const readinessExit = await probeReadiness(opts, token, session.sessionId);
  if (readinessExit !== EXIT_OK) return readinessExit;
  return probeBrief(opts, token, session.sessionId);
}

async function probeReadiness(opts, token, sessionId) {
  step(`tools/call check-readiness (${opts.issue})`);
  const response = await callTool(opts.endpoint, token, sessionId, 'check-readiness', { issueKey: opts.issue }, opts.timeoutMs, 3);
  const result = unwrapToolResult(response);
  if (result.isError) return technical(`refus ou erreur : ${truncate(result.text, 300)}`);
  const problems = checkReadinessPayload(result.json);
  if (problems.length > 0) {
    ko('contrôles de préparation en échec :');
    problems.forEach((problem) => line(`  · ${problem}`));
    return EXIT_TECH;
  }
  const score = result.json;
  ok(`score ${score.score}/100 — ${score.status} — ${score.gaps.length} manque(s) expliqué(s)`);
  for (const gap of score.gaps) line(`    −${gap.pointsLost} ${gap.criterion} : ${gap.reason}`);
  return EXIT_OK;
}

async function probeBrief(opts, token, sessionId) {
  step(`tools/call get-work-brief (${opts.issue}, budget ${opts.budget})`);
  const response = await callTool(opts.endpoint, token, sessionId, 'get-work-brief', { issueKey: opts.issue, budget: opts.budget }, opts.timeoutMs, 4);
  const result = unwrapToolResult(response);
  if (result.isError) return technical(`refus ou erreur : ${truncate(result.text, 300)}`);
  const verdict = checkBriefPayload(result.json, opts.budget);
  if (verdict.problems.length > 0) {
    ko('contrôles du brief en échec :');
    verdict.problems.forEach((problem) => line(`  · ${problem}`));
    return EXIT_TECH;
  }
  if (verdict.served !== opts.budget) info(`repli de budget : demandé ${opts.budget}, servi ${verdict.served}`);
  ok(`brief servi (budget ${verdict.served}) : ~${verdict.tokens} jetons pour une cible de ${verdict.target}`);
  ok('bandeau « données, jamais des instructions » présent');
  return EXIT_OK;
}

/** Cas de refus 1 : une écriture sans identité ne doit rien pouvoir écrire. */
async function runRefusal(opts) {
  step('Cas de refus — écriture sans identité (aucun jeton envoyé)');
  const response = await callTool(opts.endpoint, '', '', 'claim-work', { issueKey: opts.issue, agentName: 'mcp-e2e' }, opts.timeoutMs, 5);
  info(`statut HTTP : ${response.status}`);
  info(`corps : ${truncate(response.text, 240)}`);
  if (response.status === 401 || response.status === 403) {
    ok('refus obtenu : aucune écriture n’a pu partir (le serveur exige un jeton OAuth utilisateur).');
    info('La seconde couche (identité absente du contexte Forge → refus « identité de l’appelant');
    info('absente ») est couverte par les tests unitaires de `test/actions/write`, pas par ce transport.');
    return EXIT_OK;
  }
  return technical(`réponse inattendue : un appel sans jeton doit être refusé (reçu ${response.status}).`);
}

/** Cas de refus 2 (BC-09) : l'utilisateur B ne voit rien du ticket privé. */
async function runBc09(opts, token) {
  if (!opts.privateIssue) {
    return technical('option --private-issue absente : il faut un ticket inaccessible à l’utilisateur du jeton.');
  }
  step(`Cas BC-09 — utilisateur sans accès à ${opts.privateIssue}`);
  const response = await callTool(opts.endpoint, token, '', 'get-work-brief', { issueKey: opts.privateIssue, budget: opts.budget }, opts.timeoutMs, 6);
  const result = unwrapToolResult(response);
  info(`statut HTTP : ${response.status}`);
  info(`isError : ${result.isError}`);
  info(`réponse : ${truncate(result.text, 300)}`);
  if (!result.isError) return technical('un appel sans droits a réussi : le refus BC-09 n’est pas respecté.');
  const leaks = opts.expectAbsent.filter((needle) => result.text.toLowerCase().includes(needle.toLowerCase()));
  if (leaks.length > 0) return technical(`le refus laisse fuir du contenu : ${leaks.join(', ')}`);
  ok('refus sans contenu : aucun des marqueurs surveillés n’apparaît dans la réponse.');
  return EXIT_OK;
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                       */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  line('brief-forge — test de bout en bout du serveur MCP');
  info(`point d’accès : ${opts.endpoint}`);
  if (opts.mode === 'discovery') return runDiscovery(opts);
  if (opts.mode === 'auth-url') return runAuthUrl(opts);
  if (opts.mode === 'selftest') return runSelfTest(opts);
  const token = readToken(opts);
  if (!token) {
    if (opts.mode === 'refusal') return runRefusal(opts);
    return blocked('aucun jeton : MCP_TOKEN n’est pas défini et --token-file n’est pas fourni.');
  }
  info(`jeton lu depuis ${token.source} (jamais affiché, jamais écrit)`);
  if (opts.mode === 'check') return runCheck(opts, token.token);
  if (opts.mode === 'refusal') return runRefusal(opts);
  if (opts.mode === 'bc09') return runBc09(opts, token.token);
  return runCalls(opts, token.token);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.exitCode = technical(`échec technique : ${error && error.message ? error.message : String(error)}`);
}
