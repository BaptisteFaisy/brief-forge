/**
 * Harnais de vérification du comparateur d'outils.
 *
 * Jest ne transforme pas les `.mjs` (modules ESM) : ce script, lancé par
 * `node`, importe la lib et vérifie les deux comportements qui comptent —
 * le suffixe d'installation n'est pas un écart, un outil inconnu en est un.
 *
 * Sortie : une ligne par assertion ; code de sortie 1 si une assertion
 * échoue.
 */
import { cleOutil, compareTools } from '../../scripts/lib/manifestTools.mjs';

const MANIFEST = {
  actions: [
    { key: 'get-work-brief', inputs: [{ name: 'issueKey', type: 'string', required: true }] },
    { key: 'check-readiness', inputs: [{ name: 'issueKey', type: 'string', required: true }] },
  ],
  mcpTools: ['get-work-brief', 'check-readiness'],
};

function outil(name) {
  return {
    name,
    inputSchema: {
      type: 'object',
      properties: { issueKey: { type: 'string' } },
      required: ['issueKey'],
    },
  };
}

const echecs = [];

function verifier(condition, libelle) {
  console.log(`${libelle} -> ${condition}`);
  if (!condition) echecs.push(libelle);
}

/** Rendu lisible de `cleOutil` : la clé résolue, ou `null`. */
function rendre(nom, actions) {
  const cle = cleOutil(nom, actions);
  console.log(`${nom} -> ${cle === null ? 'null' : cle}`);
  return cle;
}

const actions = MANIFEST.actions.map((action) => action.key);

verifier(rendre('get-work-brief', actions) === 'get-work-brief', 'résolution de get-work-brief');
verifier(
  rendre('get-work-brief_development', actions) === 'get-work-brief',
  'résolution de get-work-brief_development'
);
verifier(rendre('autre_chose', actions) === null, 'résolution de autre_chose');

const avecInstallation = compareTools(
  [outil('get-work-brief'), outil('check-readiness'), outil('get-work-brief_development')],
  MANIFEST
);
verifier(avecInstallation.ok, 'installations: aucun écart');

const avecInconnu = compareTools([outil('get-work-brief'), outil('outil-inconnu')], MANIFEST);
verifier(!avecInconnu.ok, 'inconnu: écart détecté');

if (echecs.length > 0) {
  console.error(`ÉCHEC : ${echecs.join(', ')}`);
  process.exit(1);
}
console.log('OK');
