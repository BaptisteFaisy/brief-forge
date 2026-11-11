/**
 * Fabrique commune des sections du brief.
 *
 * Une section = un **rang** (ordre § 7.1), un **titre**, des **items sourcés**
 * (`SourcedItem`, chacun avec source + date, BC-02), un **outil** de repli qui
 * donne la suite quand la section est tronquée, et une **règle de troncature**
 * (combien d'items on affiche, et ce qu'on dit des autres).
 *
 * Aucune section ne réimplémente son rendu : elles décrivent toutes un
 * `SectionSpec` et passent par `renderSection`. La citation sécurisée vient de
 * la couche sécurité (`quoteUntrusted`), qui applique le durcissement BC-10.
 */

import { SECTION_ORDER, SectionName } from '../config';
import { displayDate, hardenUntrustedText, isSourceComplete } from '../security/quoting';
import { SourcedItem } from '../types';
import { bulletList, numberedCriteria, quoteBlock, sectionHeader, truncationHint } from '../util/markdown';
import { estimateTokens } from '../util/tokens';

export type SectionKind = 'quote' | 'criteria' | 'bullets';

/** Description déclarative d'une section, avant rendu et avant budget. */
export interface SectionSpec {
  name: SectionName;
  rank: number;
  title: string;
  /** Outil MCP qui donne les éléments non affichés. */
  tool: string;
  kind: SectionKind;
  items: SourcedItem[];
  /** Texte affiché quand la section est vide (BC-03 : on signale le trou). */
  emptyNote?: string;
}

/** Section effectivement rendue, avec le compte de ce qui a été coupé. */
export interface RenderedSection {
  name: SectionName;
  rank: number;
  title: string;
  markdown: string;
  tokens: number;
  items: SourcedItem[];
  hidden: number;
  truncated: boolean;
}

/** Rang officiel d'une section (§ 7.1), 1-based. */
export function rankOf(name: SectionName): number {
  return SECTION_ORDER.indexOf(name) + 1;
}

/** Un item n'est publiable que s'il porte une source ET une date (BC-02). */
export function hasSource(item: SourcedItem): boolean {
  return Boolean(item && item.text && isSourceComplete({ author: item.source, date: item.date }));
}

/** Filtre les items non sourcés : un élément sans source est supprimé. */
export function sourcedOnly(items: SourcedItem[]): SourcedItem[] {
  return items.filter(hasSource);
}

/** Construit un item sourcé, en garantissant les champs obligatoires. */
export function sourcedItem(text: string, source: string, date: string): SourcedItem {
  return { text: text.trim(), source, date };
}

/** Ligne d'un item : le texte, puis sa provenance datée. */
export function itemLine(item: SourcedItem): string {
  return `${item.text} — _${item.source}, ${displayDate(item.date)}_`;
}

/**
 * Cite un contenu tiers : durcissement (BC-10) puis bloc `>` préfixé de sa
 * source et de sa date. Un texte vide après durcissement est supprimé.
 */
function quotedItem(item: SourcedItem): string {
  const hardened = hardenUntrustedText(item.text);
  if (hardened === '') return '';
  return quoteBlock(hardened, item.source, displayDate(item.date));
}

function renderBody(kind: SectionKind, items: SourcedItem[]): string {
  if (items.length === 0) return '';
  if (kind === 'quote') {
    return items.map(quotedItem).filter((block) => block.length > 0).join('\n\n');
  }
  if (kind === 'criteria') {
    return numberedCriteria(items.map(itemLine));
  }
  return bulletList(items.map(itemLine));
}

/**
 * Rend une section en n'affichant que `visibleCount` items.
 * Les items coupés sont annoncés avec le nom de l'outil qui donne la suite.
 */
export function renderSection(
  spec: SectionSpec,
  visibleCount: number = spec.items.length
): RenderedSection {
  const items = sourcedOnly(spec.items);
  const total = items.length;
  const visible = Math.max(0, Math.min(visibleCount, total));
  const shown = items.slice(0, visible);
  const hidden = total - visible;
  const body = renderBody(spec.kind, shown);
  const hint = truncationHint(hidden, spec.tool);
  const blocks = [sectionHeader(spec.rank, spec.title)];
  if (body) {
    blocks.push(body);
  } else if (total === 0) {
    blocks.push(spec.emptyNote ?? '_Rien de sourcé ici : ne pas deviner (voir Trous)._');
  }
  if (hint) blocks.push(hint);
  const markdown = blocks.join('\n\n');
  return {
    name: spec.name,
    rank: spec.rank,
    title: spec.title,
    markdown,
    tokens: estimateTokens(markdown),
    items: shown,
    hidden,
    truncated: hidden > 0,
  };
}

/** Rendu de toutes les sections, dans l'ordre officiel. */
export function renderSections(
  specs: SectionSpec[],
  visible: Map<SectionName, number>
): RenderedSection[] {
  return specs.map((spec) => renderSection(spec, visible.get(spec.name) ?? spec.items.length));
}
