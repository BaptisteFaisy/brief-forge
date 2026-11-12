/**
 * Parcours d'arbre React pour les tests : aucun DOM, aucun réseau, aucune
 * dépendance au runtime Forge.
 *
 * Un élément React porte `type` et `props` :
 *  - `type` chaîne   → composant UI Kit (`@forge/react` exporte ses composants
 *    sous forme de chaînes) : feuille du parcours, on lit ses props visibles ;
 *  - `type` fonction → un de nos composants : on l'appelle et on parcourt son
 *    rendu (les `render*` et les composants de `components/` sont purs, sans
 *    hook — un composant à hook lèverait « Invalid hook call », ce qui est le
 *    comportement voulu) ;
 *  - `type` symbole  → `React.Fragment`, `React.StrictMode` : transparents.
 */

export interface ReactElementLike {
  type: unknown;
  props: Record<string, unknown>;
}

/** Props qui portent du texte visible sur un composant UI Kit. */
const TEXT_PROPS = ['text', 'title'] as const;

function isElement(node: unknown): node is ReactElementLike {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

function isComponent(type: unknown): type is (props: Record<string, unknown>) => unknown {
  return typeof type === 'function';
}

/** Nom lisible d'un type React : chaîne UI Kit, nom de fonction, symbole. */
export function nameOfType(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || 'Anonymous';
  }
  if (typeof type === 'symbol') {
    const key = Symbol.keyFor(type) ?? type.toString();
    return key.replace(/^Symbol\(react\.(.+)\)$/, '$1');
  }
  if (isElement(type) || (typeof type === 'object' && type !== null)) {
    const wrapper = type as { displayName?: string; type?: unknown; render?: unknown };
    if (wrapper.displayName) return wrapper.displayName;
    if (wrapper.type) return nameOfType(wrapper.type);
    if (typeof wrapper.render === 'function') return nameOfType(wrapper.render);
  }
  return 'Unknown';
}

/**
 * Enfants d'un nœud : `react-test-renderer` expose les enfants déjà rendus
 * dans un champ `children` de premier niveau, un élément React brut les porte
 * dans `props.children`.
 */
function childrenOf(element: ReactElementLike): unknown {
  if ('children' in element) return (element as { children?: unknown }).children;
  return element.props.children;
}

/** Rendu d'un composant fonction, ou `undefined` si le type n'est pas appelable. */
function renderComponent(element: ReactElementLike): unknown {
  if (!isComponent(element.type)) return undefined;
  return element.type(element.props);
}

/**
 * Parcours en profondeur pré-ordre : `visit` voit chaque nœud (élément,
 * tableau, texte). Un composant fonction est remplacé par son rendu — ses
 * `props.children` ne sont donc jamais comptés deux fois.
 */
export function walk(node: unknown, visit: (node: unknown) => void): void {
  visit(node);
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!isElement(node)) return;
  if (isComponent(node.type)) {
    walk(renderComponent(node), visit);
    return;
  }
  walk(childrenOf(node), visit);
}

/** Concatène tous les textes visibles de l'arbre, dans l'ordre de rendu. */
export function collectTexts(node: unknown): string[] {
  const texts: string[] = [];
  walk(node, (current) => {
    if (typeof current === 'string' || typeof current === 'number') {
      texts.push(String(current));
      return;
    }
    if (isElement(current) && typeof current.type === 'string') {
      for (const prop of TEXT_PROPS) {
        const value = current.props[prop];
        if (typeof value === 'string') texts.push(value);
      }
    }
  });
  return texts;
}

/** Texte normalisé (espaces compactés) de tout l'arbre. */
export function textOf(node: unknown): string {
  return collectTexts(node).join(' ').replace(/\s+/g, ' ').trim();
}

/** Tous les éléments d'un type donné, avec leurs props. */
export function findAll(node: unknown, typeName: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  walk(node, (current) => {
    if (isElement(current) && nameOfType(current.type) === typeName) found.push(current.props);
  });
  return found;
}

/** Types présents dans l'arbre, pour vérifier la composition d'un écran. */
export function collectTypes(node: unknown): string[] {
  const types: string[] = [];
  walk(node, (current) => {
    if (isElement(current)) types.push(nameOfType(current.type));
  });
  return types;
}
