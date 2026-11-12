/**
 * Sortie console et codes de sortie partagés par les scripts d'exploitation.
 *
 * Les codes sont **honnêtes** : jamais un échec masqué en succès.
 *   0 = vérifications passées
 *   1 = échec technique (réseau, réponse illisible, écart de contrat)
 *   2 = bloqué sur une étape humaine (activation admin, consentement OAuth)
 */

export const EXIT_OK = 0;
export const EXIT_TECH = 1;
export const EXIT_HUMAN = 2;

/** Ce qu'un humain doit faire, dans l'ordre réel de déblocage. */
export const HUMAN_STEPS = [
  "activation de l'exposition externe par un administrateur : Administration Atlassian → Apps → Sites → <site>.atlassian.net → Connected apps → « Brief de contexte »",
  'consentement OAuth 2.1 dans un navigateur (code d’autorisation + PKCE) : le jeton utilisateur ne peut pas être obtenu sans écran',
  'transmission du jeton au script : export MCP_TOKEN=… (ou --token-file ~/secrets/bf-mcp.token, hors du dépôt)',
];

export function line(text = '') {
  process.stdout.write(`${text}\n`);
}

export function step(text) {
  line('');
  line(`── ${text}`);
}

export function ok(text) {
  line(`  ✓ ${text}`);
}

export function ko(text) {
  line(`  ✗ ${text}`);
}

export function info(text) {
  line(`  · ${text}`);
}

export function truncate(text, max) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** Bloc « bloqué sur une étape humaine » + code de sortie associé. */
export function blocked(reason) {
  step('BLOQUÉ — une étape humaine est requise');
  ko(reason);
  line('');
  line('  Dans l’ordre, voici ce qui ne peut pas être fait par ce script :');
  HUMAN_STEPS.forEach((item, index) => line(`    ${index + 1}. ${item}`));
  return EXIT_HUMAN;
}

/** Raccourci : verdict technique immédiat après un message d'échec. */
export function technical(reason) {
  ko(reason);
  return EXIT_TECH;
}
