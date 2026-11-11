/**
 * Masquage des secrets dans le contenu tiers (BC-11).
 *
 * Trois temps :
 * 1. les marqueurs `[SECRET:…]` déjà présents sont **mis sous protection** pour
 *    ne pas être re-masqués en cascade ;
 * 2. la primitive `redactSecrets` du socle s'applique (formats connus) ;
 * 3. les motifs complémentaires de ce module s'appliquent (formats que la
 *    primitive ne couvre pas : JWT, clés privées, URL authentifiées, forges) ;
 * 4. les marqueurs protégés sont restaurés.
 *
 * Aucun secret n'est jamais journalisé : on ne renvoie que des marqueurs.
 */
import { redactSecrets } from '../security';

interface MaskPattern {
  regex: RegExp;
  placeholder: string;
}

/** Marqueur de secret déjà posé. */
const MARKER_PATTERN = /\[SECRET:[A-Z0-9_]+\]/g;

/**
 * Marqueur détruit par la primitive du socle : son dernier motif
 * (`secret\s*[:=]…`) reconnaît le mot `SECRET:` **à l'intérieur** de ses propres
 * marqueurs et les re-masque. On répare en un marqueur générique — l'information
 * de type est perdue, jamais le secret.
 */
const NESTED_MARKER_PATTERN = /\[SECRET:\s*\[SECRET:REDACTED\]/g;

/** Délimiteur de protection des marqueurs (caractère de contrôle improbable). */
const SHIELD = '\u0001';
const SHIELD_PATTERN = /\u0001(\d+)\u0001/g;

/**
 * Motifs complémentaires, appliqués après la primitive.
 * Chaque `regex` est globale : `replace` traite toutes les occurrences.
 */
const EXTRA_PATTERNS: MaskPattern[] = [
  // Clé privée PEM (RSA, EC, OpenSSH, PGP) : tout le bloc.
  {
    regex:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    placeholder: '[SECRET:PRIVATE_KEY]',
  },
  // JWT (en-tête base64url commençant par eyJ).
  {
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    placeholder: '[SECRET:JWT]',
  },
  // Jetons de forges et de fournisseurs.
  { regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, placeholder: '[SECRET:GITLAB_PAT]' },
  { regex: /\bnpm_[A-Za-z0-9]{36}\b/g, placeholder: '[SECRET:NPM_TOKEN]' },
  { regex: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g, placeholder: '[SECRET:STRIPE_KEY]' },
  { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, placeholder: '[SECRET:GOOGLE_API_KEY]' },
  { regex: /\bAZDO[A-Za-z0-9]{40,}\b/g, placeholder: '[SECRET:AZURE_PAT]' },
  { regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, placeholder: '[SECRET:SENDGRID_KEY]' },
  // En-tête d'autorisation et webhook Slack.
  { regex: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, placeholder: '$1 [SECRET:TOKEN]' },
  {
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g,
    placeholder: '[SECRET:SLACK_WEBHOOK]',
  },
  // Identifiants dans une URL : schéma://utilisateur:motdepasse@hôte
  {
    regex: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    placeholder: '$1[SECRET:CREDENTIALS]@',
  },
  // Chaîne de connexion à une base de données.
  {
    regex: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s"']+/gi,
    placeholder: '[SECRET:CONNECTION_STRING]',
  },
  // Affectations sensibles en français, non couvertes par la primitive.
  {
    regex:
      /\b(mot\s+de\s+passe|motdepasse|cl[ée]\s+d['’]?api|jeton|identifiant\s+secret)\s*[:=]\s*["']?[^\s"',;&]+["']?/gi,
    placeholder: '$1: [SECRET:REDACTED]',
  },
  // Clé d'accès AWS secrète (40 caractères base64-like après un libellé).
  {
    regex: /\b(aws_?secret_?access_?key|aws_?session_?token)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi,
    placeholder: '$1: [SECRET:AWS_SECRET]',
  },
];

/** Met les marqueurs existants sous protection, en gardant leur libellé. */
function shieldMarkers(text: string): { shielded: string; markers: string[] } {
  const markers: string[] = [];
  const shielded = text.replace(MARKER_PATTERN, (marker) => {
    markers.push(marker);
    return `${SHIELD}${markers.length - 1}${SHIELD}`;
  });
  return { shielded, markers };
}

/** Restaure les marqueurs protégés après masquage. */
function restoreMarkers(text: string, markers: string[]): string {
  return text.replace(SHIELD_PATTERN, (_match, index: string) => {
    const marker = markers[Number(index)];
    return marker ?? '[SECRET:REDACTED]';
  });
}

/**
 * Masque tous les secrets reconnus dans un texte tiers.
 * Idempotent : re-masquer un texte déjà masqué ne change rien.
 */
export function maskSecrets(text: string): string {
  if (!text) return '';
  const { shielded, markers } = shieldMarkers(text);
  let masked = redactSecrets(shielded);
  masked = repairNestedMarkers(masked);
  for (const { regex, placeholder } of EXTRA_PATTERNS) {
    masked = masked.replace(regex, placeholder);
  }
  return restoreMarkers(masked, markers);
}

/** Réduit `[SECRET: [SECRET:REDACTED]` à un marqueur unique. */
function repairNestedMarkers(text: string): string {
  return text.replace(NESTED_MARKER_PATTERN, '[SECRET:REDACTED]');
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
  const before = (text.match(MARKER_PATTERN) ?? []).length;
  const after = (masked.match(MARKER_PATTERN) ?? []).length;
  return Math.max(after - before, 1);
}
