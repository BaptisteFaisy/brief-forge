/**
 * Orchestration de la couche de sécurité pour un contenu tiers (BC-10, BC-11).
 *
 * Ordre imposé, du plus sûr au plus coûteux :
 *   1. **masquage des secrets** (BC-11) — rien de sensible ne circule, même si
 *      le contenu est ensuite conservé ;
 *   2. **détection d'instruction** : règles locales d'abord (gratuit, immédiat),
 *      modèle ensuite (optionnel, seulement si les règles n'ont rien vu) ;
 *   3. **remplacement** : un contenu écarté devient une phrase explicite qui
 *      nomme l'auteur et la date, jamais un bloc vide et jamais un silence ;
 *   4. **citation** : le contenu conservé est mis en bloc `>` avec sa source.
 *
 * Règle d'or : en cas de doute, on retire. Un élément sans source est supprimé.
 */
import { SourcedItem } from '../types';
import {
  ClassifierDeps,
  classifyInstruction,
  isInstructionVerdict,
  isModelClassifierAvailable,
  ModelVerdict,
} from './injectionClassifier';
import { detectInjection, InjectionVerdict } from './injectionRules';
import { isSourceComplete, quoteUntrusted, SourceMeta, sourceLabelWithDate } from './quoting';
import { maskSecrets } from './secretMasker';

export type DiscardReason = 'instruction-regle' | 'instruction-modele' | 'sans-source';

export interface SanitizeMeta extends SourceMeta {
  author: string;
  date: string;
}

export interface SanitizedContent {
  /** Bloc cité prêt à insérer dans le brief, `''` si le contenu est écarté. */
  quoted: string;
  /** Texte masqué (non cité), `''` si le contenu est écarté. */
  text: string;
  discarded: boolean;
  reason: DiscardReason | null;
  /** Verdict des règles locales, pour l'audit du brief. */
  verdict: InjectionVerdict | null;
  /** Verdict du modèle, `'non-appele'` si le contrôle par modèle n'a pas eu lieu. */
  model: ModelVerdict | 'non-appele';
}

const PREVIEW_CHARS = 120;

/** Phrase de remplacement d'un contenu écarté (§ 4.5). */
export function discardedNotice(meta: SanitizeMeta): string {
  const label = isSourceComplete(meta) ? sourceLabelWithDate(meta) : 'source inconnue';
  return `[contenu écarté : instruction suspecte dans le commentaire de ${label}]`;
}

/**
 * Contrat § 4.5, version synchrone : règles locales + masquage + citation.
 * Renvoie `''` si la source est incomplète (élément supprimé).
 */
export function sanitizeForBrief(text: string, meta: SanitizeMeta): string {
  if (!isSourceComplete(meta)) return '';
  const masked = maskSecrets(text);
  if (detectInjection(masked).suspicious) return discardedNotice(meta);
  return quoteUntrusted(masked, meta);
}

/** Construit un résultat écarté, avec sa raison. */
function discarded(
  reason: DiscardReason,
  verdict: InjectionVerdict | null,
  model: ModelVerdict | 'non-appele'
): SanitizedContent {
  return { quoted: '', text: '', discarded: true, reason, verdict, model };
}

/**
 * Contrôle par modèle : `true` si le modèle voit une instruction **ou** s'il
 * n'a pas pu rendre de verdict (repli sûr). `false` seulement si bénin déclaré.
 */
async function modelFlagsInstruction(
  text: string,
  deps: ClassifierDeps
): Promise<{ flagged: boolean; verdict: ModelVerdict | 'non-appele' }> {
  if (!deps.callModel && !isModelClassifierAvailable()) {
    return { flagged: false, verdict: 'non-appele' };
  }
  const verdict = await classifyInstruction(text, deps);
  return { flagged: isInstructionVerdict(verdict), verdict };
}

/**
 * Orchestration complète, asynchrone (avec contrôle par modèle optionnel).
 * Ne lève jamais : toute panne du modèle retombe sur les règles.
 */
export async function sanitizeContent(
  text: string,
  meta: SanitizeMeta,
  deps: ClassifierDeps = {}
): Promise<SanitizedContent> {
  if (!isSourceComplete(meta)) return discarded('sans-source', null, 'non-appele');
  const masked = maskSecrets(text);
  const verdict = detectInjection(masked);
  if (verdict.suspicious) return discarded('instruction-regle', verdict, 'non-appele');
  const model = await modelFlagsInstruction(masked, deps);
  if (model.flagged) return discarded('instruction-modele', verdict, model.verdict);
  const quoted = quoteUntrusted(masked, meta);
  if (quoted === '') return discarded('sans-source', verdict, model.verdict);
  return {
    quoted,
    text: masked,
    discarded: false,
    reason: null,
    verdict,
    model: model.verdict,
  };
}

/** Version « brief » asynchrone : bloc cité ou phrase d'écartement, jamais vide. */
export async function sanitizeContentForBrief(
  text: string,
  meta: SanitizeMeta,
  deps: ClassifierDeps = {}
): Promise<string> {
  if (!isSourceComplete(meta)) return '';
  const result = await sanitizeContent(text, meta, deps);
  return result.discarded ? discardedNotice(meta) : result.quoted;
}

// --- Décisions contradictoires -------------------------------------------

const STOPWORDS = new Set([
  'les', 'des', 'une', 'aux', 'pour', 'par', 'avec', 'sans', 'sur', 'dans', 'que',
  'qui', 'pas', 'plus', 'est', 'sont', 'etre', 'avoir', 'nous', 'vous', 'elle',
  'cette', 'ces', 'leur', 'the', 'and', 'or', 'for', 'with', 'without', 'that',
  'this', 'these', 'from', 'not', 'are', 'was', 'were', 'have', 'has', 'its',
]);

const NEGATION_PATTERN = /\b(ne|n['’]|pas|jamais|aucun|aucune|sans|not|never|no|don['’]t|avoid)\b/i;

/** Normalise pour comparaison : minuscules, sans accents, ponctuation réduite. */
function normalizeForCompare(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mots porteurs de sens d'un texte (longueur ≥ 4, hors mots vides). */
function significantTokens(text: string): Set<string> {
  return new Set(
    normalizeForCompare(text)
      .split(' ')
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
  );
}

/** Vrai si le texte porte une négation (polarité « non »). */
function isNegated(text: string): boolean {
  return NEGATION_PATTERN.test(text ?? '');
}

/** Indice de recouvrement de deux ensembles de mots (0 à 1). */
function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }
  return common / Math.min(left.size, right.size);
}

/** Extrait court d'un élément, pour le message d'alerte. */
function preview(item: SourcedItem): string {
  const flat = (item.text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
}

/**
 * Repère deux éléments qui parlent du même sujet avec des polarités opposées.
 * On ne tranche pas : on **signale** la contradiction pour un humain.
 */
export function detectContradictions(items: SourcedItem[]): string[] {
  const messages: string[] = [];
  const prepared = items.map((item) => ({
    item,
    tokens: significantTokens(item.text),
    negated: isNegated(item.text),
  }));
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i];
      const right = prepared[j];
      if (left.negated === right.negated) continue;
      if (overlapRatio(left.tokens, right.tokens) < 0.5) continue;
      messages.push(contradictionMessage(left.item, right.item));
    }
  }
  return messages;
}

/** Message normalisé d'une contradiction détectée. */
function contradictionMessage(left: SourcedItem, right: SourcedItem): string {
  const format = (item: SourcedItem) => `« ${preview(item)} » (${item.source}, ${item.date})`;
  return (
    `Décision contradictoire signalée : ${format(left)} s'oppose à ${format(right)}. ` +
    'À trancher par un humain avant de coder.'
  );
}
