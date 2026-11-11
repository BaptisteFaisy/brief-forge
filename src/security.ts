/**
 * Socle de sécurité : masquage des secrets (BC-11) et détection d'instructions
 * cachées (BC-10) pour le **chemin de lecture** — collecte, actions de lecture
 * et sections du brief passent tous par `sanitizeTicketContent`.
 *
 * Les motifs de secrets vivent dans `src/security/secretPatterns.ts`, seule
 * source partagée avec le chemin d'écriture (`secretMasker`) : un motif ajouté
 * là-bas s'applique aux deux chemins, sans duplication ni import circulaire.
 */
import { SECRET_MARKER_PATTERN, SECRET_PATTERNS } from './security/secretPatterns';

/**
 * Motifs d'instructions suspectes ou injections de prompt (BC-10).
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|directions)/i,
  /ignore\s+les\s+(instructions|consignes)\s+(précédentes|antérieures)/i,
  /pousse\s+sur\s+main/i,
  /push\s+to\s+main/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /bypass\s+all\s+(safeguards|rules|filters)/i,
  /system\s+override/i,
  /do\s+not\s+follow\s+any\s+prior/i,
  /ne\s+tiens\s+pas\s+compte\s+de/i,
  /override\s+safety/i,
];

/** Recolle les segments nettoyés en remettant chaque marqueur à sa place. */
function rejoin(segments: string[], markers: string[]): string {
  return segments
    .map((segment, index) => (index < markers.length ? segment + markers[index] : segment))
    .join('');
}

/**
 * Applique **un** motif, uniquement hors des marqueurs `[SECRET:…]` déjà
 * présents. Les marqueurs sont mis à l'écart par `split` puis recollés tels
 * quels.
 *
 * Sans cette protection, le motif générique `token: …` reconnaît « SECRET: »
 * **à l'intérieur** d'un marqueur et le détruit (`[SECRET: [SECRET:REDACTED]`),
 * en perdant le type du secret qui sert à l'audit.
 */
function applyOutsideMarkers(text: string, regex: RegExp, placeholder: string): string {
  const markers = text.match(SECRET_MARKER_PATTERN) ?? [];
  if (markers.length === 0) return text.replace(regex, placeholder);
  const segments = text.split(SECRET_MARKER_PATTERN).map((part) => part.replace(regex, placeholder));
  return rejoin(segments, markers);
}

/**
 * Masque tous les secrets reconnus dans un texte tiers (BC-11).
 *
 * Un seul passage, un motif après l'autre, et les marqueurs sont protégés **à
 * chaque étape** : ceux déjà présents dans le texte d'origine comme ceux posés
 * par un motif précédent du même passage. D'où l'idempotence — masquer deux
 * fois ne dégrade jamais un marqueur, qui garde son type.
 */
export function redactSecrets(text: string): string {
  if (!text) return '';
  return SECRET_PATTERNS.reduce(
    (masked, { regex, placeholder }) => applyOutsideMarkers(masked, regex, placeholder),
    text
  );
}

export function detectPromptInjection(text: string): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Point d'application unique du nettoyage sur le chemin de lecture : un contenu
 * tiers est soit écarté (instruction suspecte, BC-10), soit renvoyé avec ses
 * secrets masqués (BC-11) — le même jeu de motifs que sur le chemin d'écriture.
 */
/** Préfixe unique de la mention d'écart : la détection en dépend (§ 13). */
export const DISCARDED_PREFIX = '[contenu écarté :';

/** Vrai si ce texte est une mention d'écart produite par `sanitizeTicketContent`. */
export function isDiscardedNotice(text: string): boolean {
  return typeof text === 'string' && text.startsWith(DISCARDED_PREFIX);
}

export function sanitizeTicketContent(
  text: string,
  author = 'inconnu',
  date = 'date non précisée'
): string {
  if (!text) return '';
  if (detectPromptInjection(text)) {
    return `${DISCARDED_PREFIX} instruction suspecte détectée dans le message de ${author}, ${date}]`;
  }
  return redactSecrets(text);
}
