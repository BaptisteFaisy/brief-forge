/**
 * Jeton utilisateur MCP : ce qu'on stocke, son état, son renouvellement.
 *
 * Pourquoi ce module existe : `scripts/mcp-login.mjs` enregistre un client
 * auprès du serveur d'autorisation (RFC 7591, « Dynamic Client Registration »)
 * à **chaque** exécution, et n'écrivait que le jeton. Or un `refresh_token` ne
 * s'utilise qu'avec le `client_id` qui l'a vu naître (RFC 6749 § 6). Sans lui,
 * un jeton expiré — durée de vie 8 h — est irrécupérable, et il faut rejouer le
 * consentement à la main. La preuve du 13 novembre affirmait « `refresh_token`
 * permet de le renouveler » : vérifié faux le 14 novembre, le fichier ne porte
 * aucun `client_id`. C'était une promesse, pas une mesure.
 *
 * Ce module centralise ce qui manquait, sans duplication entre le script de
 * connexion et le test de bout en bout :
 * - `jetonPersiste` — la forme écrite dans le fichier (jeton + client +
 *   ressource + horodatages) ;
 * - `restantSegondes` / `estExpire` — l'état du jeton stocké ;
 * - `corpsRefresh` / `motifNonRenouvelable` — le corps de requête de
 *   renouvellement, ou la raison précise de son impossibilité ;
 * - `lireJetonStocke` / `ecrireJetonStocke` — le fichier, `0600`, hors dépôt.
 *
 * Aucun appel réseau ici : les échanges restent dans les scripts. Ce module est
 * pur, donc testable hors ligne — la CI n'a ni réseau, ni jeton.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Marge avant l'expiration réelle. Un jeton à 30 secondes de sa fin est déjà
 * inutilisable : le temps du handshake MCP, il est mort. On déclare donc
 * « expiré » dès que ce reste est dessous, plutôt qu'à zéro.
 */
export const MARGE_EXPIRATION_S = 120;

/**
 * Enrichit le jeton brut reçu du serveur d'autorisation, pour le rendre
 * rejouable. `client_id` et `resource` sont les deux pièces qui manquaient :
 * sans elles, aucun renouvellement possible ; sans horodatage, aucun moyen de
 * dire si le jeton vaut encore quelque chose.
 */
export function jetonPersiste(brut, contexte = {}, maintenant = Date.now()) {
  const obtenu = Math.floor(maintenant / 1000);
  const duree = Number(brut.expires_in) || 0;
  return {
    ...brut,
    client_id: contexte.clientId || brut.client_id || '',
    resource: contexte.resource || brut.resource || '',
    obtenu_a: obtenu,
    expire_a: duree ? obtenu + duree : 0,
  };
}

/**
 * Secondes restantes, ou `null` si le jeton ne porte pas d'horodatage exploitable.
 * `null` veut dire « on ne sait pas », pas « infini » : sur ce cas,
 * `estExpire` répond faux et aucune alerte n'est émise.
 */
export function restantSegondes(jeton, maintenant = Date.now()) {
  const expireA = Number(jeton && jeton.expire_a) || 0;
  if (!expireA) return null;
  return expireA - Math.floor(maintenant / 1000);
}

/** Vrai si le jeton est expiré, ou assez proche de l'expiration pour ne plus compter. */
export function estExpire(jeton, maintenant = Date.now()) {
  const reste = restantSegondes(jeton, maintenant);
  return reste !== null && reste <= MARGE_EXPIRATION_S;
}

/**
 * Corps de requête de renouvellement (RFC 6749 § 6), ou `null` s'il est
 * impossible. La ressource est reprise du jeton : le périmètre du jeton
 * renouvelé doit rester celui du jeton d'origine.
 */
export function corpsRefresh(jeton, endpoint = '') {
  const refresh = (jeton && jeton.refresh_token) || '';
  const clientId = (jeton && jeton.client_id) || '';
  if (!refresh || !clientId) return null;
  const corps = { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId };
  const ressource = endpoint || (jeton && jeton.resource) || '';
  if (ressource) corps.resource = ressource;
  return corps;
}

/**
 * Pourquoi un renouvellement est impossible, en un mot près — la liste des
 * pièces manquantes. Vide si tout est là. Un message vague (« jeton invalide »)
 * ferait chercher un bug serveur là où il manque une ligne dans un fichier.
 */
export function motifNonRenouvelable(jeton) {
  const manques = [];
  if (!jeton || !jeton.refresh_token) manques.push('refresh_token');
  if (!jeton || !jeton.client_id) manques.push('client_id');
  if (manques.length === 0) return '';
  return (
    `renouvellement impossible : ${manques.join(' et ')} absent${manques.length > 1 ? 's' : ''} du fichier. ` +
    'Un jeton obtenu avant la persistance du client ne peut pas être rafraîchi : ' +
    'le consentement doit être rejoué (node scripts/mcp-login.mjs).'
  );
}

/**
 * Alerte à afficher avant d'utiliser un jeton stocké : vide s'il vaut encore
 * quelque chose, sinon ce qu'il faut faire. Partagée par la connexion et le
 * test de bout en bout — un seul endroit décide de ce que « expiré » veut dire.
 */
export function alerteJeton(jeton, maintenant = Date.now()) {
  if (!jeton || !jeton.access_token) return 'aucun jeton exploitable dans le fichier.';
  if (!estExpire(jeton, maintenant)) return '';
  const reste = restantSegondes(jeton, maintenant);
  const base =
    reste <= 0
      ? `jeton expiré depuis ${Math.abs(reste)} s`
      : `jeton expirant dans ${reste} s (marge ${MARGE_EXPIRATION_S} s)`;
  const motif = motifNonRenouvelable(jeton);
  return motif ? `${base} — ${motif}` : `${base} — renouvelez : node scripts/mcp-login.mjs --refresh`;
}

/**
 * Lit un jeton depuis son texte : du JSON (la réponse du serveur
 * d'autorisation) ou un jeton brut. Une seule implémentation de cette règle,
 * partagée par la connexion et le test de bout en bout.
 */
export function jetonDepuisTexte(texte) {
  const valeur = String(texte ?? '').trim();
  if (valeur === '') return null;
  if (!valeur.startsWith('{')) return { access_token: valeur };
  try {
    const objet = JSON.parse(valeur);
    return objet && typeof objet === 'object' ? objet : { access_token: String(objet) };
  } catch {
    return { access_token: '' };
  }
}

/** Lit le fichier de jeton ; `null` s'il est absent ou vide. */
export function lireJetonStocke(chemin) {
  if (!existsSync(chemin)) return null;
  return jetonDepuisTexte(readFileSync(chemin, 'utf8'));
}

/** Écrit le fichier de jeton en 0600, hors du dépôt (création des dossiers parents). */
export function ecrireJetonStocke(chemin, jeton) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(jeton, null, 1)}\n`, { mode: 0o600 });
  chmodSync(chemin, 0o600);
}
