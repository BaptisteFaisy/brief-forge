/**
 * Règles de détection d'instructions adressées à un agent (BC-10).
 *
 * Le produit transporte du texte écrit par des tiers (commentaires Jira, pages
 * Confluence) vers un agent de code qui a la main sur un dépôt. Tout texte tiers
 * est donc une **donnée**, jamais une instruction : ces règles repèrent les
 * tournures qui cherchent à faire exécuter quelque chose à l'agent.
 *
 * Deux sévérités :
 * - `game_over` : prise de contrôle, action irréversible, exfiltration, faux
 *   délimiteur système. Le contenu est écarté **immédiatement**, sans appel au
 *   modèle (aucun doute à lever : on ne discute pas).
 * - `suspect` : tournure d'instruction plausible mais qui peut apparaître dans
 *   un échange légitime. Le contenu est écarté aussi (règle d'or : en cas de
 *   doute, on retire), mais la raison est tracée pour l'audit.
 *
 * Les motifs de la primitive `detectPromptInjection` (socle) restent un filet
 * de sécurité complémentaire : on ne les recopie pas ici (zéro duplication).
 */
import { detectPromptInjection } from '../security';

export type InjectionSeverity = 'game_over' | 'suspect';

export interface InjectionRule {
  /** Identifiant stable, utilisé dans les messages et les journaux. */
  id: string;
  /** Description lisible de ce que la règle reconnaît. */
  label: string;
  severity: InjectionSeverity;
  /** Motif sans drapeau `g` : `test()` reste sans état entre deux appels. */
  pattern: RegExp;
}

export interface InjectionVerdict {
  /** Vrai dès qu'au moins une règle déclenche : le contenu est écarté. */
  suspicious: boolean;
  /** Sévérité la plus haute rencontrée, `null` si rien n'a déclenché. */
  severity: InjectionSeverity | null;
  /** Identifiants des règles déclenchées, dans l'ordre de déclaration. */
  ruleIds: string[];
  /** Libellés lisibles correspondants, pour le message d'écartement. */
  labels: string[];
}

/** Prise de contrôle des consignes, changement de rôle, extraction de prompt. */
const CONTROL_RULES: InjectionRule[] = [
  {
    id: 'override-instructions-en',
    label: 'demande d’ignorer les consignes précédentes',
    severity: 'game_over',
    pattern:
      /\b(ignore|disregard|forget|bypass|override)\s+(all\s+|any\s+|the\s+|your\s+|these\s+|les\s+|des\s+|tes\s+|mes\s+)*(previous|prior|above|earlier|system|safety)?\s*(instructions?|consignes?|rules?|prompts?|directives?)\b/i,
  },
  {
    id: 'override-instructions-fr',
    label: 'demande d’ignorer les consignes précédentes (fr)',
    severity: 'game_over',
    pattern:
      /\b((ne\s+)?(pas\s+)?(tiens?|tenir|prends?|prendre)\s+(pas\s+|plus\s+)?compte|n['’]ob[ée]is\s+plus|oublie\s+(les|tes|toutes)|fais\s+abstraction\s+de)\b[^.\n]{0,40}\b(consignes?|instructions?|r[èe]gles?|directives?)\b/i,
  },
  {
    id: 'role-hijack',
    label: 'changement de rôle de l’assistant',
    severity: 'game_over',
    pattern:
      /\b(you\s+are\s+now|from\s+now\s+on,?\s+you\s+are|act\s+as\s+(an?\s+)?(admin|root|system|developer)|developer\s+mode|jailbreak|do\s+anything\s+now)\b/i,
  },
  {
    id: 'role-hijack-fr',
    label: 'changement de rôle de l’assistant (fr)',
    severity: 'game_over',
    pattern:
      /\b(tu\s+es\s+(maintenant|d[ée]sormais)|[àa]\s+partir\s+de\s+maintenant\s+tu\s+es|mode\s+(d[ée]veloppeur|administrateur)|nouveau\s+r[ôo]le)\b/i,
  },
  {
    id: 'system-prompt-extraction',
    label: 'tentative d’extraction du prompt système',
    severity: 'suspect',
    pattern:
      /\b(reveal|show|print|repeat|display|leak)\b[^.\n]{0,30}\b(system\s+prompt|hidden\s+(rules|instructions)|initial\s+instructions)\b/i,
  },
  {
    id: 'system-prompt-extraction-fr',
    label: 'tentative d’extraction du prompt système (fr)',
    severity: 'suspect',
    pattern:
      /\b(affiche|montre|r[ée]p[èe]te|donne|r[ée]v[èe]le)\b[^.\n]{0,30}\b(prompt\s+syst[èe]me|tes\s+instructions|consignes\s+cach[ée]es)\b/i,
  },
];

/** Actions irréversibles, désactivation des garde-fous, exfiltration. */
const ACTION_RULES: InjectionRule[] = [
  {
    id: 'irreversible-git',
    label: 'action git irréversible demandée',
    severity: 'game_over',
    pattern:
      /\b(push\s+(directly\s+)?to\s+main|pousse\s+(directement\s+)?sur\s+main|force[-\s]?push|git\s+push\s+(-f|-\-force)|merge\s+sans\s+revue|mets\s+en\s+prod\s+maintenant)\b/i,
  },
  {
    id: 'disable-safety-net',
    label: 'désactivation des garde-fous (tests, CI, hooks)',
    severity: 'game_over',
    pattern:
      /\b(skip|disable|remove|delete)\s+(the\s+|all\s+|les\s+|tous\s+les\s+)?(tests?|ci|checks?|lint|hooks?|checks?\s+de\s+s[ée]curit[ée])\b|\b(--no-verify|rm\s+-rf|drop\s+table|truncate\s+table)\b/i,
  },
  {
    id: 'disable-safety-net-fr',
    label: 'désactivation des garde-fous (fr)',
    severity: 'game_over',
    pattern:
      /\b(d[ée]sactive|supprime|enl[èe]ve|ignore)\s+(les\s+|tous\s+les\s+)?(tests?|la\s+ci|les\s+contr[ôo]les|les\s+hooks?|la\s+revue)\b/i,
  },
  {
    id: 'secret-exfiltration-en',
    label: 'exfiltration de secrets demandée',
    severity: 'game_over',
    pattern:
      /\b(cat|print|echo|send|upload|post|curl|wget|scp)\b[^.\n]{0,40}(\.env|id_rsa|\.ssh|credentials?|secrets?|api[_\s-]?keys?|environment\s+variables?|env\s+vars?)\b/i,
  },
  {
    id: 'secret-exfiltration-fr',
    label: 'exfiltration de secrets demandée (fr)',
    severity: 'game_over',
    pattern:
      /\b(envoie|transf[èe]re|affiche|renvoie|imprime|exfiltre)\b[^.\n]{0,40}(\.env|id_rsa|\.ssh|identifiants?|mots?\s+de\s+passe|cl[ée]s?\s+d['’]api|secrets?)\b/i,
  },
  {
    id: 'delegation-bypass',
    label: 'contournement de la validation humaine',
    severity: 'suspect',
    pattern:
      /\b(without\s+(asking|review|approval|confirmation)|sans\s+(me\s+|nous\s+)?demander\s+(mon\s+avis|la\s+permission|confirmation)|sans\s+validation\s+humaine)\b/i,
  },
];

/** Formules d'adressage direct à un agent, pression, faux délimiteurs. */
const FRAMING_RULES: InjectionRule[] = [
  {
    id: 'agent-address',
    label: 'instruction adressée explicitement à un agent',
    severity: 'suspect',
    pattern:
      /\b(cher|dear|hey|salut)\s+(agent|assistant|ia|ai|copilot|cursor|claude|gpt)\b|\b(agent|assistant|ia|ai|llm)\s*[:,]\s*(ignore|fais|ex[ée]cute|run|do|push|pousse|applique)\b|\b(instruction|instructions|message|note)s?\s+(pour|to)\s+(l['’]|the\s+)?(agent|ia|ai|assistant|llm)\b/i,
  },
  {
    id: 'urgency-pressure',
    label: 'pression ou urgence pour forcer l’action',
    severity: 'suspect',
    pattern:
      /\b(urgent|imp[ée]ratif|obligatoire)\s*:|\b(sinon|otherwise)\b[^.\n]{0,40}\b(d[ée]sactiv|puni|supprim|bloqu|r[ée]voqu)|\bsans\s+discuter\b|\bdo\s+it\s+now\b|\bno\s+questions\s+asked\b/i,
  },
  {
    id: 'markup-spoof',
    label: 'faux délimiteur de message système',
    severity: 'game_over',
    pattern:
      /(<\/?\s*(system|instructions?|prompt)\s*>|\[\s*(system|inst)\s*\]|^\s*(system|assistant|human|developer)\s*:|###\s*(system|instruction)|begin\s+(system|instructions?))/im,
  },
  {
    id: 'tool-call-spoof',
    label: 'faux appel d’outil injecté dans le texte',
    severity: 'game_over',
    pattern:
      /(<\|\s*(tool|function)\s*\|>|"tool_calls"\s*:|\bfunction_call\s*:|<function=|\btool_use\b\s*[:=])/i,
  },
];

/** Toutes les règles, dans l'ordre d'évaluation. */
export const INJECTION_RULES: InjectionRule[] = [
  ...CONTROL_RULES,
  ...ACTION_RULES,
  ...FRAMING_RULES,
];

/** Identifiant du verdict rendu par la primitive du socle. */
export const SOCLE_RULE_ID = 'socle:detectPromptInjection';

/**
 * Évalue un texte tiers contre toutes les règles.
 * Aucun effet de bord : les motifs sont sans drapeau `g`.
 */
export function detectInjection(text: string): InjectionVerdict {
  const verdict: InjectionVerdict = {
    suspicious: false,
    severity: null,
    ruleIds: [],
    labels: [],
  };
  if (!text || text.trim() === '') {
    return verdict;
  }
  for (const rule of INJECTION_RULES) {
    if (rule.pattern.test(text)) {
      recordHit(verdict, rule.id, rule.label, rule.severity);
    }
  }
  if (detectPromptInjection(text)) {
    recordHit(verdict, SOCLE_RULE_ID, 'motif de la primitive du socle', 'suspect');
  }
  return verdict;
}

/** Ajoute un déclenchement et élève la sévérité si besoin. */
function recordHit(
  verdict: InjectionVerdict,
  id: string,
  label: string,
  severity: InjectionSeverity
): void {
  verdict.suspicious = true;
  verdict.ruleIds.push(id);
  verdict.labels.push(label);
  if (severity === 'game_over' || verdict.severity === null) {
    verdict.severity = severity;
  }
}

/** Vrai si le verdict impose un écartement immédiat, sans appel au modèle. */
export function isGameOver(verdict: InjectionVerdict): boolean {
  return verdict.severity === 'game_over';
}

/** Vrai si la règle identifiée est une règle « game over » connue. */
export function isGameOverRule(ruleId: string): boolean {
  return INJECTION_RULES.some(
    (rule) => rule.id === ruleId && rule.severity === 'game_over'
  );
}

/** Résumé lisible d'un verdict, destiné au message d'écartement du brief. */
export function explainVerdict(verdict: InjectionVerdict): string {
  if (!verdict.suspicious) {
    return 'aucune instruction suspecte détectée';
  }
  const unique = Array.from(new Set(verdict.labels));
  return unique.join(' ; ');
}
