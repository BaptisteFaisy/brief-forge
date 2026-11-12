#!/usr/bin/env node
/**
 * Générateur du jeu de démonstration de brief-forge (vidéo de soumission).
 *
 * Lit `demo/seed.json` (données pures) et en tire les requêtes REST
 * Jira/Confluence correspondantes : ticket de la démo, tickets voisins, liens,
 * page de décision Confluence, commentaires, critères collés à l'écran,
 * commentaire piégé, faux secret, remise à zéro entre deux prises.
 * La construction des requêtes vit dans `scripts/lib/seedRequests.mjs`.
 *
 * Principe de sécurité : **le mode par défaut est `--dry-run`** — le script
 * imprime les requêtes sans rien envoyer. `--send` exige les identifiants dans
 * l'environnement (`ATLASSIAN_API_EMAIL` + `ATLASSIAN_API_TOKEN`) ; ils ne sont
 * jamais imprimés, jamais écrits, jamais acceptés en argument.
 *
 * Aucune dépendance npm : `fetch` et `node:fs` du runtime Node suffisent.
 * Codes de sortie : 0 = requêtes produites (ou envoyées) sans erreur,
 * 1 = échec technique ou argumentaire.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { httpRequest, parsePayload } from './lib/http.mjs';
import { buildRequests, fakeSecretOf, poisonRequests, resetCommentMarkers, STAGES, substitute } from './lib/seedRequests.mjs';
import { EXIT_OK, info, ko, line, ok, step, technical, truncate } from './lib/output.mjs';

const DEFAULT_TIMEOUT_MS = 30000;

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

const VALUE_FLAGS = {
  '--seed': (o, v) => { o.seedPath = v; },
  '--site': (o, v) => { o.site = v; },
  '--issue': (o, v) => { o.issueKey = v; },
  '--stage': (o, v) => { o.stage = v; },
  '--timeout': (o, v) => { o.timeoutMs = Number(v); },
};

function defaultOptions() {
  return {
    seedPath: 'demo/seed.json',
    site: process.env.DEMO_SITE || '',
    issueKey: process.env.DEMO_ISSUE || '',
    stage: 'initial',
    send: false,
    withPoison: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
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
    if (arg === '--dry-run') continue;
    if (arg === '--send') {
      opts.send = true;
      continue;
    }
    if (arg === '--with-poison') {
      opts.withPoison = true;
      continue;
    }
    const setter = VALUE_FLAGS[arg];
    const value = argv[index + 1];
    if (!setter) usageError(`option inconnue : ${arg}`);
    if (!value || value.startsWith('--')) usageError(`valeur manquante pour ${arg}`);
    setter(opts, value);
    index += 1;
  }
  if (opts.stage !== 'all' && !STAGES.includes(opts.stage)) {
    usageError(`--stage inconnu : ${opts.stage} (attendu : ${STAGES.join(', ')} ou all)`);
  }
  return opts;
}

function usageError(message) {
  ko(message);
  line('');
  printUsage();
  process.exit(1);
}

function printUsage() {
  line('Usage : node scripts/demo-seed.mjs [--stage <étape>] [--dry-run|--send] [options]');
  line('');
  line('Étapes (--stage) :');
  line('  initial   ticket + voisins + liens + page Confluence + commentaires (défaut)');
  line('  fixed     critères d’acceptation, composant, réponse à la question');
  line('  poison    commentaire piégé de la séquence 5');
  line('  secret    commentaire au faux secret (masquage [SECRET:…])');
  line('  reset     remise à zéro entre deux prises');
  line('  all       initial + fixed + poison + secret (répétition complète)');
  line('');
  line('Options :');
  line('  --seed <chemin>    jeu de données (défaut : demo/seed.json)');
  line('  --site <hôte>      site Atlassian (défaut : celui du jeu de données)');
  line('  --issue <KEY>      ticket existant, requis hors étape « initial »');
  line('  --timeout <ms>     délai par requête (défaut : 30000)');
  line('  --send             envoie vraiment (défaut : --dry-run, aucune écriture)');
  line('  --with-poison      avec --stage reset : rejoue aussi le commentaire piégé');
  line('');
  line('Identifiants (--send uniquement, lus dans l’environnement, jamais imprimés) :');
  line('  ATLASSIAN_API_EMAIL, ATLASSIAN_API_TOKEN');
  line('  ATLASSIAN_API_EMAIL_2, ATLASSIAN_API_TOKEN_2  (second compte, question)');
}

/* ------------------------------------------------------------------ */
/* Contexte                                                             */
/* ------------------------------------------------------------------ */

function buildContext(seed, opts) {
  const site = opts.site || seed.meta.site;
  const space = seed.meta.confluenceSpaceKey;
  return {
    seed,
    site,
    spaceKey: space,
    issueKey: opts.issueKey || '',
    pageId: '',
    pageUrl: `https://${site}/wiki/spaces/${space}/pages/{{PAGE_ID}}`,
    fakeSecret: fakeSecretOf(seed),
    timeoutMs: opts.timeoutMs,
    issueState: null,
    NEIGHBOR0: '',
    NEIGHBOR1: '',
    NEIGHBOR2: '',
  };
}

function stagesOf(opts) {
  if (opts.stage !== 'all') return [opts.stage];
  return STAGES.filter((stage) => stage !== 'reset');
}

function requireIssueKey(opts, stages) {
  if (stages.some((stage) => stage !== 'initial') && !opts.issueKey) {
    usageError('hors étape « initial », --issue <KEY> est requis (ou DEMO_ISSUE dans l’environnement).');
  }
}

/** Plan de requêtes, avec le commentaire piégé rejoué si demandé au reset. */
function requestsFor(seed, stages, warnings, opts) {
  const requests = buildRequests(seed, stages, warnings);
  if (!opts.withPoison || !stages.includes('reset')) return requests;
  const replay = poisonRequests(seed).map((item) => ({
    ...item,
    stage: 'reset',
    label: `${item.label} — rejoué pour la prise suivante`,
  }));
  return [...requests, ...replay];
}

/** Identifiants lus dans l'environnement, encodés pour l'en-tête `Basic`. */
function credentials() {
  const email = (process.env.ATLASSIAN_API_EMAIL || '').trim();
  const token = (process.env.ATLASSIAN_API_TOKEN || '').trim();
  if (email === '' || token === '') return null;
  const secondEmail = (process.env.ATLASSIAN_API_EMAIL_2 || '').trim();
  const secondToken = (process.env.ATLASSIAN_API_TOKEN_2 || '').trim();
  return {
    primary: Buffer.from(`${email}:${token}`).toString('base64'),
    second: secondEmail && secondToken ? Buffer.from(`${secondEmail}:${secondToken}`).toString('base64') : '',
  };
}

/* ------------------------------------------------------------------ */
/* Impression (dry-run)                                                 */
/* ------------------------------------------------------------------ */

function printRequest(item, ctx, index) {
  step(`${index + 1}. [${item.stage}] ${item.method} https://${ctx.site}${substitute(item.path, ctx)}`);
  info(`objet : ${item.label}`);
  if (item.as === 'second') info('identité : second compte (ATLASSIAN_API_EMAIL_2) s’il est fourni, sinon compte principal');
  if (item.deriveNote) info(`résolu à l’envoi : ${item.deriveNote}`);
  if (item.warnSecret) {
    info('⚠ texte contenant un FAUX secret construit à l’exécution : ne jamais le recopier');
    info('  dans un fichier du dépôt — la garde CI refuse les jetons en clair.');
  }
  info('en-têtes : Content-Type: application/json · Authorization: Basic <ATLASSIAN_API_EMAIL:ATLASSIAN_API_TOKEN — non affiché>');
  if (item.body === undefined) {
    info('corps : (aucun)');
    return;
  }
  line(JSON.stringify(substitute(item.body, ctx), null, 2).replace(/^/gm, '    '));
}

function printMcpChecklist(seed, ctx) {
  step('À faire ensuite avec un client MCP (impossible en REST : données en Forge SQL)');
  for (const call of seed.meta.mcpCalls) {
    line(`  · ${call.tool} ${JSON.stringify(substitute(call.arguments, ctx))}`);
    info(call.why);
  }
}

/* ------------------------------------------------------------------ */
/* Envoi (--send)                                                       */
/* ------------------------------------------------------------------ */

async function sendRequest(item, ctx, creds) {
  const auth = item.as === 'second' && creds.second ? creds.second : creds.primary;
  if (item.as === 'second' && !creds.second) {
    info('second compte absent : la question sera posée par le compte principal (le manque « question sans réponse » restera actif).');
  }
  const init = {
    method: item.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
    },
    timeoutMs: ctx.timeoutMs,
  };
  if (item.body !== undefined) init.body = JSON.stringify(substitute(item.body, ctx));
  const response = await httpRequest(`https://${ctx.site}${substitute(item.path, ctx)}`, init);
  return {
    status: response.status,
    ok: response.status < 300,
    text: response.text,
    payload: parsePayload(response.text, response.headers.get('content-type')),
  };
}

/** Mémorise les identifiants découverts pour les requêtes suivantes. */
function captureFrom(item, response, ctx) {
  const payload = response.payload || {};
  if (item.capture === 'issueKey' && payload.key) ctx.issueKey = payload.key;
  if (item.capture === 'pageId' && payload.id) {
    ctx.pageId = String(payload.id);
    ctx.pageUrl = `https://${ctx.site}/wiki/spaces/${ctx.spaceKey}/pages/${payload.id}`;
  }
  if (/^neighbor\d$/.test(item.capture || '') && payload.key) ctx[item.capture.toUpperCase()] = payload.key;
}

async function sendAll(requests, ctx, creds) {
  let failures = 0;
  for (const [index, item] of requests.entries()) {
    const done = item.derived ? await sendDerived(item, ctx, creds) : await sendPlain(item, ctx, creds, index);
    if (!done) failures += 1;
  }
  return failures;
}

async function sendPlain(item, ctx, creds, index) {
  const response = await sendRequest(item, ctx, creds);
  const label = `${index + 1}. ${item.method} ${substitute(item.path, ctx)}`;
  if (!response.ok) {
    ko(`${label} → ${response.status} : ${truncate(response.text, 200)}`);
    return false;
  }
  ok(`${label} → ${response.status}`);
  captureFrom(item, response, ctx);
  return true;
}

/** Requêtes de remise à zéro : la cible vient d'une lecture, jamais devinée. */
async function sendDerived(item, ctx, creds) {
  if (item.capture === 'issueState') {
    const response = await sendRequest(item, ctx, creds);
    if (!response.ok) {
      ko(`lecture du ticket impossible (${response.status}) : remise à zéro abandonnée.`);
      return false;
    }
    ctx.issueState = response.payload || {};
    ok('état du ticket lu (étiquettes + commentaires)');
    return true;
  }
  if (!ctx.issueState) {
    ko('remise à zéro : état du ticket non lu — requête dérivée ignorée.');
    return false;
  }
  return item.repeat ? deleteAgentComments(item, ctx, creds) : removeClarificationLabel(item, ctx, creds);
}

/** Supprime les commentaires ajoutés depuis l'état 0:00 (marques connues). */
async function deleteAgentComments(item, ctx, creds) {
  const markers = resetCommentMarkers(ctx.seed);
  const comments = ((ctx.issueState.fields || {}).comment || {}).comments || [];
  const targets = comments.filter((c) => markers.some((m) => String(c.body || '').includes(m)));
  if (targets.length === 0) {
    ok('aucun commentaire ajouté depuis l’état 0:00 : rien à supprimer.');
    return true;
  }
  let clean = true;
  for (const comment of targets) {
    const response = await sendRequest({ ...item, path: item.path.replaceAll('{{COMMENT_ID}}', String(comment.id)) }, ctx, creds);
    if (response.ok) ok(`commentaire ${comment.id} supprimé`);
    else {
      ko(`suppression du commentaire ${comment.id} refusée (${response.status})`);
      clean = false;
    }
  }
  return clean;
}

/** Retire l'étiquette de clarification en conservant les autres. */
async function removeClarificationLabel(item, ctx, creds) {
  const clarification = ctx.seed.meta.labels.clarification;
  const labels = ((ctx.issueState.fields || {}).labels || []).filter((label) => label !== clarification);
  const response = await sendRequest({ ...item, body: { fields: { labels } } }, ctx, creds);
  if (!response.ok) {
    ko(`étiquettes non mises à jour (${response.status}) : ${truncate(response.text, 160)}`);
    return false;
  }
  ok(`étiquette « ${clarification} » retirée (${labels.length} étiquette(s) conservée(s))`);
  return true;
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                       */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seed = JSON.parse(readFileSync(resolve(opts.seedPath), 'utf8'));
  const ctx = buildContext(seed, opts);
  const stages = stagesOf(opts);
  requireIssueKey(opts, stages);
  line('brief-forge — jeu de démonstration rejouable');
  info(`site : ${ctx.site} · projet : ${seed.meta.projectKey} · étape(s) : ${stages.join(', ')}`);
  info(`mode : ${opts.send ? 'ENVOI RÉEL (--send)' : 'dry-run (aucune requête envoyée)'}`);

  const warnings = [];
  const requests = requestsFor(seed, stages, warnings, opts);
  warnings.forEach((warning) => info(warning));

  if (!opts.send) {
    requests.forEach((item, index) => printRequest(item, ctx, index));
    printMcpChecklist(seed, ctx);
    step('Ce que le seed REST ne peut pas faire');
    seed.meta.limits.forEach((limit) => info(limit));
    ok(`${requests.length} requête(s) produite(s), aucune envoyée. Ajoutez --send pour les jouer.`);
    return EXIT_OK;
  }

  const creds = credentials();
  if (!creds) return technical('--send exige ATLASSIAN_API_EMAIL et ATLASSIAN_API_TOKEN dans l’environnement.');
  const failures = await sendAll(requests, ctx, creds);
  step('Résultat');
  info(`ticket de la démo : ${ctx.issueKey || '(non créé)'}`);
  if (ctx.pageId) info(`page Confluence : ${ctx.pageUrl}`);
  printMcpChecklist(seed, ctx);
  return failures === 0 ? EXIT_OK : technical(`${failures} requête(s) en échec.`);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.exitCode = technical(`échec technique : ${error && error.message ? error.message : String(error)}`);
}
