/**
 * Motifs de secrets sensibles à masquer systématiquement (BC-11).
 */
const SECRET_PATTERNS: Array<{ regex: RegExp; placeholder: string }> = [
  { regex: /sk-[A-Za-z0-9_\-]{20,}/g, placeholder: '[SECRET:OPENAI_KEY]' },
  { regex: /sk-ant-[A-Za-z0-9_\-]{20,}/g, placeholder: '[SECRET:ANTHROPIC_KEY]' },
  { regex: /ghp_[A-Za-z0-9]{36}/g, placeholder: '[SECRET:GH_PAT]' },
  { regex: /gho_[A-Za-z0-9]{36}/g, placeholder: '[SECRET:GH_OAUTH]' },
  { regex: /github_pat_[A-Za-z0-9_]{50,}/g, placeholder: '[SECRET:GH_FINE_PAT]' },
  { regex: /xox[baprs]-[0-9A-Za-z\-]{10,}/g, placeholder: '[SECRET:SLACK_TOKEN]' },
  { regex: /AKIA[0-9A-Z]{16}/g, placeholder: '[SECRET:AWS_ACCESS_KEY]' },
  {
    regex: /(password|secret|passwd|pwd|token)\s*[:=]\s*["']?([^\s"';&]+)["']?/gi,
    placeholder: '$1: [SECRET:REDACTED]',
  },
];

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

/**
 * Marqueur produit par le masquage, par exemple `[SECRET:GH_PAT]`.
 * Il ne doit jamais être re-masqué par un passage suivant (idempotence).
 */
const MARKER_PATTERN = /\[SECRET:[^\]]*\]/g;

export function redactSecrets(text: string): string {
  if (!text) return '';
  // On protège les marqueurs déjà posés : seuls les segments hors marqueur
  // sont nettoyés, puis on recolle. Sans cela, le motif générique
  // `token: …` reconnaît « SECRET: » à l'intérieur d'un marqueur et le
  // détruit (`[SECRET: REDA*[REDACTED]]`), en perdant le type du secret.
  const parts = text.split(MARKER_PATTERN);
  const markers = text.match(MARKER_PATTERN) ?? [];
  const cleaned = parts.map((part) => {
    let segment = part;
    for (const { regex, placeholder } of SECRET_PATTERNS) {
      segment = segment.replace(regex, placeholder);
    }
    return segment;
  });
  return cleaned
    .map((segment, index) => (index < markers.length ? segment + markers[index] : segment))
    .join('');
}

export function detectPromptInjection(text: string): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeTicketContent(
  text: string,
  author = 'inconnu',
  date = 'date non précisée'
): string {
  if (!text) return '';
  if (detectPromptInjection(text)) {
    return `[contenu écarté : instruction suspecte détectée dans le message de ${author}, ${date}]`;
  }
  return redactSecrets(text);
}
