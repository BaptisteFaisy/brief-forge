/**
 * Connexion OAuth au serveur MCP d'Atlassian, en tant qu'utilisateur.
 *
 * Pourquoi ce script existe : les modes `--check` et `--run` de
 * `scripts/mcp-e2e.mjs` ont besoin d'un jeton **utilisateur**, et un webtrigger
 * n'en a pas. Ce script fait ce qu'un vrai client MCP fait : il
 * s'enregistre auprès du serveur d'autorisation (DCR), ouvre une URL de
 * consentement, attend le retour du code sur une redirection de boucle locale,
 * puis échange le code contre un jeton.
 *
 * **Aucun mot de passe n'est saisi par l'agent** : l'utilisateur s'authentifie
 * dans son propre navigateur, sur la page officielle d'Atlassian. Le jeton
 * obtenu est écrit **hors du dépôt**, en `0600`.
 *
 * Usage :
 *   node scripts/mcp-login.mjs [--app-id <uuid>] [--out <fichier>]
 *
 * Sans dépendance npm : `fetch`, `node:crypto`, `node:http` et `node:fs`.
 */
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  CLIENT_INFO,
  asMetadataCandidates,
  endpointFor,
  firstReadable,
  pkcePair,
  randomState,
  resourceMetadataUrl,
} from './lib/mcpClient.mjs';

const DEFAUT_JETON = `${process.env.HOME}/.config/brief-forge/mcp.token`;

/** Args simples : --cle valeur */
function args(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const cle = argv[i].slice(2);
    const suivant = argv[i + 1];
    if (suivant === undefined || suivant.startsWith('--')) {
      parsed[cle] = '1';
    } else {
      parsed[cle] = suivant;
      i += 1;
    }
  }
  return parsed;
}

/**
 * Serveur de boucle locale : écoute le retour du code d'autorisation.
 * Le port est choisi par le système, puis lu — il faut le connaître **avant**
 * de construire l'URL de consentement, qui porte le `redirect_uri`.
 */
async function demarrerServeur() {
  let repondre = null;
  let echouer = null;
  const code = new Promise((resoudre, rejeter) => {
    repondre = resoudre;
    echouer = rejeter;
  });
  const serveur = createServer((requete, reponse) => {
    const url = new URL(requete.url, 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      reponse.writeHead(404).end('not found');
      return;
    }
    const erreur = url.searchParams.get('error');
    const valeur = url.searchParams.get('code');
    reponse
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        '<html><body style="font-family:system-ui;padding:2rem">' +
          (erreur
            ? `<h1>Échec</h1><p>${erreur}</p>`
            : '<h1>Connecté</h1><p>Le jeton est enregistré. Tu peux fermer cet onglet.</p>') +
          '</body></html>'
      );
    serveur.close();
    if (erreur) echouer(new Error(`consentement refusé : ${erreur}`));
    else if (!valeur) echouer(new Error('aucun code dans la réponse'));
    else repondre(valeur);
  });
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  return { code, port: serveur.address().port, close: () => serveur.close() };
}

/**
 * Attend le code d'autorisation, par deux voies :
 * - la **redirection de boucle locale** (`/callback`), quand le navigateur est
 *   sur la même machine que le script ;
 * - un **fichier d'attente**, quand il est ailleurs : l'utilisateur copie
 *   alors le `code` de sa barre d'adresse. Le code n'est exploitable qu'avec
 *   le vérificateur PKCE détenu par ce processus, donc le reste se fait ici.
 *
 * Sans les deux, le consentement serait utilisable par quelqu'un d'autre.
 */
async function attendreCodeAlternatif(fichier, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (existsSync(fichier)) {
      const brut = readFileSync(fichier, 'utf8').trim();
      if (brut) {
        rmSync(fichier, { force: true });
        // L'utilisateur colle parfois l'URL complète : on n'en garde que le code.
        const code = brut.includes('code=')
          ? new URL(brut).searchParams.get('code')
          : brut;
        if (code) return code;
      }
    }
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }
  throw new Error('aucun code reçu (ni rappel HTTP, ni fichier d’attente)');
}

/** Enregistrement dynamique du client (RFC 7591). */
async function enregistrerClient(registrationEndpoint, redirectUri) {
  const reponse = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_INFO.name,
      client_uri: 'https://github.com/BaptisteFaisy/brief-forge',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    }),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`enregistrement refusé (${reponse.status}) : ${texte.slice(0, 300)}`);
  }
  return JSON.parse(texte);
}

/** Échange le code contre un jeton. */
async function echangerCode(tokenEndpoint, corps) {
  const reponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corps).toString(),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`échange refusé (${reponse.status}) : ${texte.slice(0, 300)}`);
  }
  return JSON.parse(texte);
}

async function main() {
  const options = args(process.argv.slice(2));
  const appId = options['app-id'] || '08a89a5d-94d0-448f-8c1a-70f938b2c3a8';
  const sortie = options.out || DEFAUT_JETON;
  const endpoint = endpointFor(appId, options.endpoint || '');

  const ressource = await firstReadable(
    [
      resourceMetadataUrl('', endpoint),
      `https://mcp.atlassian.com/.well-known/oauth-protected-resource${new URL(endpoint).pathname}`,
    ],
    20000
  );
  if (!ressource) throw new Error('métadonnées de la ressource introuvables');
  const serveur = ressource.json;
  const autorisation = serveur.authorization_servers[0];
  const metadonnees = await firstReadable(asMetadataCandidates(autorisation), 20000);
  if (!metadonnees) throw new Error('métadonnées du serveur d’autorisation introuvables');
  const as = metadonnees.json;

  const { code: attente, port, close } = await demarrerServeur();
  const redirection = `http://127.0.0.1:${port}/callback`;
  const client = await enregistrerClient(as.registration_endpoint, redirection);

  const { verifier, challenge } = pkcePair();
  const autorisationUrl = new URL(as.authorization_endpoint);
  autorisationUrl.searchParams.set('response_type', 'code');
  autorisationUrl.searchParams.set('client_id', client.client_id);
  autorisationUrl.searchParams.set('redirect_uri', redirection);
  autorisationUrl.searchParams.set('code_challenge', challenge);
  autorisationUrl.searchParams.set('code_challenge_method', 'S256');
  autorisationUrl.searchParams.set('scope', (serveur.scopes_supported || []).join(' '));
  autorisationUrl.searchParams.set('resource', endpoint);
  autorisationUrl.searchParams.set('state', randomState());

  console.log('\n== Ouvre cette URL dans ton navigateur et accepte le consentement ==\n');
  console.log(autorisationUrl.toString());
  console.log('\n(le script attend le retour ; aucune saisie de mot de passe ici)\n');

  const fichierAttente = `${process.env.HOME}/.config/brief-forge/code.pending`;
  mkdirSync(dirname(fichierAttente), { recursive: true });
  console.log(
    `\n(si ton navigateur n'est pas sur cette machine, copie le \`code\` de ta barre\n` +
      `d'adresse et donne-le moi : je l'écrirai dans ${fichierAttente})\n`
  );

  const code = await Promise.race([
    attente,
    attendreCodeAlternatif(fichierAttente, 15 * 60 * 1000),
  ]);
  close();
  const jeton = await echangerCode(as.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: redirection,
    resource: endpoint,
  });

  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, JSON.stringify(jeton, null, 1), { mode: 0o600 });
  chmodSync(sortie, 0o600);
  console.log(`jeton enregistré dans ${sortie} (0600) — expires_in : ${jeton.expires_in}s`);
}

main().catch((erreur) => {
  console.error('ÉCHEC :', erreur.message);
  process.exit(1);
});
