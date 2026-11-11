/**
 * Jeu **unique** des motifs de secrets (BC-11).
 *
 * Ce module ne contient que des données : ni import, ni logique. Il est la
 * source de vérité partagée par les deux chemins de l'app —
 *
 * - **lecture** : `src/security.ts` (`redactSecrets` → `sanitizeTicketContent`),
 *   utilisée par la collecte Jira/Confluence, les actions de lecture et les
 *   sections du brief ;
 * - **écriture** : `src/security/secretMasker.ts` (`maskSecrets` →
 *   `maskForWrite`), utilisée avant tout envoi à Jira/Confluence.
 *
 * Le garder isolé casse l'import circulaire : `secretMasker` n'a plus besoin
 * d'importer la primitive du socle, et le socle n'a pas besoin d'importer la
 * couche complète. Ajouter un motif ici l'applique **partout**, lecture comme
 * écriture (règle contributeur § 5.7 de `docs/SECURITY.md`).
 *
 * Ordre de la liste : du plus spécifique au plus générique. Les motifs à
 * capture (`$1`) préservent le libellé ou le schéma, et les motifs larges
 * (affectations `token: …`) passent en dernier pour ne pas avaler un format
 * reconnu qui portait son type.
 */

/** Un motif de secret : l'expression globale et le jeton qui la remplace. */
export interface SecretPattern {
  /** Toujours globale : `replace` traite toutes les occurrences. */
  regex: RegExp;
  /** Jeton de remplacement ; `$1`/`$2` réinjectent les groupes capturés. */
  placeholder: string;
}

/**
 * Marqueur de masquage, par exemple `[SECRET:GH_PAT]`.
 *
 * Il ne doit **jamais** être re-masqué, ni par le motif suivant du même passage
 * ni par un passage ultérieur : le type du secret est une information d'audit,
 * pas un secret (voir `redactSecrets`, qui protège les marqueurs à chaque
 * étape). Le contenu entre crochets est laissé libre pour couvrir aussi les
 * marqueurs dégradés par d'anciennes versions (`[SECRET: [SECRET:REDACTED]`).
 */
export const SECRET_MARKER_PATTERN = /\[SECRET:[^\]]*\]/g;

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  /* --- Clés de fournisseurs de modèles (préfixe long d'abord) ----------- */
  { regex: /sk-ant-[A-Za-z0-9_\-]{20,}/g, placeholder: '[SECRET:ANTHROPIC_KEY]' },
  { regex: /sk-[A-Za-z0-9_\-]{20,}/g, placeholder: '[SECRET:OPENAI_KEY]' },

  /* --- Clés privées : tout le bloc PEM, avant les motifs de ligne -------- */
  {
    regex:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    placeholder: '[SECRET:PRIVATE_KEY]',
  },

  /* --- Jeton JWT : reconnu avant l'en-tête `Bearer` qui le porte --------- */
  {
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    placeholder: '[SECRET:JWT]',
  },

  /* --- Jetons de forge --------------------------------------------------- */
  { regex: /ghp_[A-Za-z0-9]{36}/g, placeholder: '[SECRET:GH_PAT]' },
  { regex: /gho_[A-Za-z0-9]{36}/g, placeholder: '[SECRET:GH_OAUTH]' },
  { regex: /github_pat_[A-Za-z0-9_]{50,}/g, placeholder: '[SECRET:GH_FINE_PAT]' },
  { regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, placeholder: '[SECRET:GITLAB_PAT]' },
  { regex: /\bnpm_[A-Za-z0-9]{36}\b/g, placeholder: '[SECRET:NPM_TOKEN]' },
  { regex: /\bAZDO[A-Za-z0-9]{40,}\b/g, placeholder: '[SECRET:AZURE_PAT]' },

  /* --- Fournisseurs SaaS ------------------------------------------------- */
  { regex: /xox[baprs]-[0-9A-Za-z\-]{10,}/g, placeholder: '[SECRET:SLACK_TOKEN]' },
  { regex: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g, placeholder: '[SECRET:STRIPE_KEY]' },
  { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, placeholder: '[SECRET:GOOGLE_API_KEY]' },
  { regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, placeholder: '[SECRET:SENDGRID_KEY]' },
  {
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g,
    placeholder: '[SECRET:SLACK_WEBHOOK]',
  },

  /* --- AWS --------------------------------------------------------------- */
  { regex: /AKIA[0-9A-Z]{16}/g, placeholder: '[SECRET:AWS_ACCESS_KEY]' },
  {
    regex: /\b(aws_?secret_?access_?key|aws_?session_?token)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi,
    placeholder: '$1: [SECRET:AWS_SECRET]',
  },

  /* --- Chaînes de connexion, puis identifiants embarqués dans une URL ---- */
  /* La chaîne de connexion passe d'abord : elle masque l'URL entière (hôte et
   * port compris), alors que le motif `user:pass@` ne retire que l'identifiant. */
  {
    regex: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s"']+/gi,
    placeholder: '[SECRET:CONNECTION_STRING]',
  },
  {
    regex: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi,
    placeholder: '$1[SECRET:CREDENTIALS]@',
  },

  /* --- En-tête d'autorisation porteur ------------------------------------ */
  { regex: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, placeholder: '$1 [SECRET:TOKEN]' },

  /* --- Affectations sensibles, les plus larges en dernier ---------------- */
  {
    regex:
      /\b(mot\s+de\s+passe|motdepasse|cl[ée]\s+d['’]?api|jeton|identifiant\s+secret)\s*[:=]\s*["']?[^\s"',;&]+["']?/gi,
    placeholder: '$1: [SECRET:REDACTED]',
  },
  {
    regex: /(password|secret|passwd|pwd|token)\s*[:=]\s*["']?([^\s"';&]+)["']?/gi,
    placeholder: '$1: [SECRET:REDACTED]',
  },
];
