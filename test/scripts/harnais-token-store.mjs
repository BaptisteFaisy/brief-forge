/**
 * Harnais de vérification du magasin de jetons (`scripts/lib/tokenStore.mjs`).
 *
 * Jest ne transforme pas les `.mjs` (modules ESM) : ce script, lancé par
 * `node`, importe la lib et vérifie les règles qui rendent une preuve `asUser`
 * rejouable — ou disent pourquoi elle ne l'est pas.
 *
 * Aucune écriture hors d'un répertoire temporaire, aucun appel réseau : le
 * module est pur. Sortie : une ligne par assertion ; code de sortie 1 si une
 * assertion échoue.
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  alerteJeton,
  corpsRefresh,
  ecrireJetonStocke,
  estExpire,
  jetonDepuisTexte,
  jetonPersiste,
  lireJetonStocke,
  MARGE_EXPIRATION_S,
  motifNonRenouvelable,
  restantSegondes,
} from '../../scripts/lib/tokenStore.mjs';

const echecs = [];

function verifier(condition, libelle) {
  console.log(`${libelle} -> ${Boolean(condition)}`);
  if (!condition) echecs.push(libelle);
}

/** Un instant fixe, pour que les assertions d'horodatage soient déterministes. */
const MAINTENANT = Date.UTC(2026, 10, 14, 12, 0, 0);
const SECONDES = 1000;

/* --- la forme écrite dans le fichier ---------------------------------- */

const brut = { access_token: 'AT', refresh_token: 'RT', scope: 'read:me', expires_in: 28800 };
const stocke = jetonPersiste(brut, { clientId: 'CID', resource: 'https://mcp.example/forge/x' }, MAINTENANT);

verifier(stocke.client_id === 'CID', 'client_id persisté');
verifier(stocke.resource === 'https://mcp.example/forge/x', 'resource persistée');
verifier(stocke.obtenu_a === MAINTENANT / SECONDES, 'obtenu_a horodaté');
verifier(stocke.expire_a === MAINTENANT / SECONDES + 28800, 'expire_a = obtenu + durée');
verifier(stocke.access_token === 'AT' && stocke.refresh_token === 'RT', 'jetons d’origine conservés');

const sansDuree = jetonPersiste({ access_token: 'AT' }, { clientId: 'CID' }, MAINTENANT);
verifier(sansDuree.expire_a === 0, 'sans expires_in : aucune date inventée');
verifier(restantSegondes(sansDuree, MAINTENANT) === null, 'durée inconnue -> null, pas zéro');
verifier(estExpire(sansDuree, MAINTENANT) === false, 'durée inconnue -> jamais déclaré expiré');

/* --- l'état du jeton stocké ------------------------------------------- */

const plein = jetonPersiste(brut, { clientId: 'CID' }, MAINTENANT - 3600 * SECONDES);
verifier(estExpire(plein, MAINTENANT) === false, 'jeton d’il y a 1 h : encore valide');
const mourant = jetonPersiste(brut, { clientId: 'CID' }, MAINTENANT - (28800 - 30) * SECONDES);
verifier(estExpire(mourant, MAINTENANT) === true, `reste 30 s < marge ${MARGE_EXPIRATION_S} s : expiré`);

/* --- renouvellement : possible, ou la raison précise ------------------ */

const corps = corpsRefresh(plein);
verifier(
  corps && corps.grant_type === 'refresh_token' && corps.refresh_token === 'RT' && corps.client_id === 'CID',
  'corps de renouvellement complet (RFC 6749 § 6)'
);
verifier(corps && !('resource' in corps), 'aucune resource stockée : aucune ajoutée au corps');
verifier(
  corpsRefresh(plein, 'https://mcp.example/forge/y').resource === 'https://mcp.example/forge/y',
  'resource passée en argument prioritaire'
);

// L'état réel du fichier du 13 novembre : un refresh_token, aucun client_id.
const du13 = jetonDepuisTexte(JSON.stringify(brut));
verifier(corpsRefresh(du13) === null, 'sans client_id : renouvellement impossible');
verifier(
  motifNonRenouvelable(du13).includes('client_id'),
  'la raison nomme le client_id manquant'
);
verifier(motifNonRenouvelable(plein) === '', 'jeton complet : aucune raison de refuser');
verifier(alerteJeton(plein, MAINTENANT) === '', 'jeton valide : aucune alerte');

const mort = jetonPersiste(brut, { clientId: 'CID' }, MAINTENANT - 9 * 3600 * SECONDES);
verifier(restantSegondes(mort, MAINTENANT) < 0, 'jeton d’il y a 9 h (8 h de vie) : reste négatif');
verifier(estExpire(mort, MAINTENANT) === true, 'jeton d’il y a 9 h : expiré');
verifier(alerteJeton(mort, MAINTENANT).includes('--refresh'), 'renouvelable : donne la commande');

const mort13 = jetonPersiste(brut, {}, MAINTENANT - 9 * 3600 * SECONDES);
verifier(
  alerteJeton(mort13, MAINTENANT).includes('consentement') && !alerteJeton(mort13, MAINTENANT).includes('--refresh'),
  'non renouvelable : dit le consentement, jamais un faux --refresh'
);
verifier(alerteJeton(mourant, MAINTENANT).includes('--refresh'), 'marge d’expiration : alerte et commande');

/* --- le fichier ------------------------------------------------------- */

const dossier = mkdtempSync(join(tmpdir(), 'bf-token-store-'));
try {
  const chemin = join(dossier, 'sous', 'mcp.token');
  ecrireJetonStocke(chemin, plein);
  verifier((statSync(chemin).mode & 0o777) === 0o600, 'fichier écrit en 0600');
  verifier(lireJetonStocke(chemin).client_id === 'CID', 'relecture fidèle à l’écriture');
  verifier(lireJetonStocke(join(dossier, 'absent')) === null, 'fichier absent -> null');
  verifier(jetonDepuisTexte('  ') === null, 'texte vide -> null');
  verifier(jetonDepuisTexte('AT-brut').access_token === 'AT-brut', 'jeton brut accepté');
  verifier(jetonDepuisTexte('{pas du json').access_token === '', 'JSON brisé : aucun jeton, aucune exception');
  verifier(readFileSync(chemin, 'utf8').endsWith('\n'), 'fichier terminé par un saut de ligne');
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

if (echecs.length > 0) {
  console.error(`ÉCHEC : ${echecs.join(' | ')}`);
  process.exit(1);
}
console.log('OK');
