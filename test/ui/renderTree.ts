/**
 * Petit parcours d'arbre Forge UI pour les tests : les composants sont des
 * fonctions pures (aucun hook) ou des primitives nommées. Aucun DOM, aucun
 * réseau, aucune dépendance au runtime Forge.
 */
interface ForgeTreeNode {
  type: string | ((props: Record<string, unknown>) => ForgeTreeNode);
  props: Record<string, unknown>;
}

function isElement(node: unknown): node is ForgeTreeNode {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

function childrenOf(element: ForgeTreeNode): unknown[] {
  const children = element.props.children;
  return Array.isArray(children) ? children : [];
}

function expand(node: ForgeTreeNode): unknown {
  return typeof node.type === 'function' ? node.type(node.props) : node;
}

/** Développe un composant ; `null` est un rendu valide (écran masqué). */
function expandElement(node: ForgeTreeNode): ForgeTreeNode | null {
  const result = expand(node);
  return isElement(result) ? result : null;
}

/** Concatène tous les textes visibles de l'arbre, dans l'ordre de rendu. */
export function collectTexts(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child) => collectTexts(child));
  if (!isElement(node)) return [];

  const element = expandElement(node);
  if (!element) return [];
  if (typeof element.type !== 'string') return collectTexts(element);
  // Certains composants Forge portent leur texte dans une prop (`text`, `title`).
  const ownText = [element.props.text, element.props.title].filter(
    (value): value is string => typeof value === 'string'
  );
  return ownText.concat(childrenOf(element).flatMap((child) => collectTexts(child)));
}

/** Texte normalisé (espaces compactés) de tout l'arbre. */
export function textOf(node: unknown): string {
  return collectTexts(node).join(' ').replace(/\s+/g, ' ').trim();
}

/** Tous les éléments d'un type Forge donné, avec leurs props. */
export function findAll(node: unknown, typeName: string): Array<Record<string, unknown>> {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, typeName));
  if (!isElement(node)) return [];

  const element = expandElement(node);
  if (!element) return [];
  if (typeof element.type !== 'string') return findAll(element, typeName);
  const own = element.type === typeName ? [element.props] : [];
  return own.concat(childrenOf(element).flatMap((child) => findAll(child, typeName)));
}

/** Types Forge présents dans l'arbre, pour vérifier la composition d'un écran. */
export function collectTypes(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [];
  if (Array.isArray(node)) return node.flatMap((child) => collectTypes(child));
  if (!isElement(node)) return [];

  const element = expandElement(node);
  if (!element) return [];
  if (typeof element.type !== 'string') return collectTypes(element);
  return [element.type].concat(childrenOf(element).flatMap((child) => collectTypes(child)));
}
