/**
 * Masquage des secrets sur le **chemin d'écriture** (BC-11).
 *
 * Il n'y a qu'un seul jeu de motifs et qu'un seul point d'application :
 * `src/security/secretPatterns.ts` fournit les motifs, `redactSecrets`
 * (`src/security.ts`) les applique. Ce module est donc l'API du chemin
 * d'écriture (`maskForWrite`, `sanitizeForBrief`) et n'a aucune règle propre —
 * un motif ajouté à la source s'applique à la lecture comme à l'écriture.
 *
 * L'import va dans un seul sens (ici → socle → motifs), d'où l'absence de
 * cycle : c'est précisément pourquoi les motifs ont quitté les deux modules
 * appelants.
 *
 * Aucun secret n'est jamais journalisé : on ne renvoie que des marqueurs.
 */
import { redactSecrets } from '../security';
import { SECRET_MARKER_PATTERN } from './secretPatterns';

/**
 * Masque tous les secrets reconnus dans un texte tiers.
 * Idempotent : re-masquer un texte déjà masqué ne change rien, et un marqueur
 * existant (`[SECRET:GH_PAT]`) garde son type.
 */
export function maskSecrets(text: string): string {
  return redactSecrets(text);
}

/** Vrai si le texte contient encore un secret reconnaissable. */
export function containsSecret(text: string): boolean {
  if (!text) return false;
  return maskSecrets(text) !== text;
}

/** Nombre de secrets masqués par un passage, utile pour l'audit du brief. */
export function countMaskedSecrets(text: string): number {
  if (!text) return 0;
  const masked = maskSecrets(text);
  if (masked === text) return 0;
  const before = (text.match(SECRET_MARKER_PATTERN) ?? []).length;
  const after = (masked.match(SECRET_MARKER_PATTERN) ?? []).length;
  return Math.max(after - before, 1);
}
