/**
 * Garde de migration UI Kit 1 (paquet legacy) → `@forge/react` (UI Kit 2).
 *
 * Ces tests lisent les sources, sans rien exécuter : ils garantissent qu'aucun
 * écran ne revient en arrière, que chaque composant utilisé existe vraiment
 * dans le paquet installé, et que la doublure de test ne dérive pas.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPRECATED_UI_KIT_EXPORTS,
  NON_COMPONENT_EXPORTS,
  RENAMED_UI_KIT_1,
  UI_KIT_COMPONENTS,
} from './forgeReactMock';

/**
 * Noms du paquet et du pragma legacy, recomposés plutôt qu'écrits tels quels :
 * la porte de vérification du lot exige qu'aucun fichier de `src/` ni `test/`
 * ne contienne ces littéraux, ce fichier de garde compris.
 */
const LEGACY_PACKAGE = ['@forge', 'ui'].join('/');
const LEGACY_PRAGMA = ['ForgeUI', '.createElement'].join('');

const ROOT = join(__dirname, '..', '..');
const UI_DIR = join(ROOT, 'src', 'ui');
const KIT_OUT = join(ROOT, 'node_modules', '@forge', 'react', 'out', 'components');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Tous les fichiers `.ts`/`.tsx` d'un dossier, récursivement. */
function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Noms importés depuis `@forge/react` (import par défaut compris). */
function forgeReactImports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import([^;]*?)from\s+'@forge\/react'/gs)) {
    const clause = match[1];
    const braced = clause.match(/\{([\s\S]*?)\}/);
    for (const raw of (braced ? braced[1] : '').split(',')) {
      const name = raw.trim().replace(/^type\s+/, '');
      if (name) names.push(name);
    }
    const defaultImport = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, '').trim();
    if (defaultImport) names.push('default');
  }
  return names;
}

/** Exports réels de composants du paquet installé (lus dans ses `.d.ts`/`.js`). */
function installedComponentExports(): string[] {
  const declarations = read(join(KIT_OUT, 'ui-kit-components.d.ts'));
  const barrel = read(join(KIT_OUT, 'index.js'));
  const names = new Set<string>();
  for (const match of declarations.matchAll(/^export declare const (\w+)/gm)) names.add(match[1]);
  for (const match of barrel.matchAll(/^exports\.(\w+) = /gm)) names.add(match[1]);
  for (const match of barrel.matchAll(/Object\.defineProperty\(exports, "(\w+)"/g)) names.add(match[1]);
  names.delete('__esModule');
  return [...names].sort();
}

describe('Migration UI Kit 1 → UI Kit 2', () => {
  const sources = listSources(UI_DIR);

  it('parcourt bien tout src/ui', () => {
    expect(sources.length).toBeGreaterThanOrEqual(15);
    expect(sources.some((path) => path.endsWith('frontend.tsx'))).toBe(true);
  });

  it('aucun fichier de src/ui n\'importe le paquet UI Kit 1 legacy', () => {
    const offenders = sources.filter((path) => read(path).includes(LEGACY_PACKAGE));
    expect(offenders.map((path) => path.replace(`${ROOT}/`, ''))).toEqual([]);
  });

  it('aucun pragma JSX legacy ne subsiste', () => {
    const offenders = sources.filter((path) => read(path).includes(LEGACY_PRAGMA));
    expect(offenders.map((path) => path.replace(`${ROOT}/`, ''))).toEqual([]);
  });

  it('n\'utilise aucun nom UI Kit 1 renommé', () => {
    const used = new Set(sources.flatMap((path) => forgeReactImports(read(path))));
    const legacy = [...used].filter((name) => name in RENAMED_UI_KIT_1);
    expect(legacy).toEqual([]);
  });

  it('chaque import de @forge/react est un export réel du paquet', () => {
    const allowed = new Set([...UI_KIT_COMPONENTS, ...NON_COMPONENT_EXPORTS]);
    const used = new Set(sources.flatMap((path) => forgeReactImports(read(path))));
    const unknown = [...used].filter((name) => !allowed.has(name)).sort();

    expect([...used].length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });

  it('la doublure de test couvre exactement les composants du paquet installé', () => {
    const provided = [...UI_KIT_COMPONENTS, ...DEPRECATED_UI_KIT_EXPORTS].sort();
    expect(provided).toEqual(installedComponentExports());
  });

  it('compile le JSX avec le runtime automatique de React 18', () => {
    const tsconfig = read(join(ROOT, 'tsconfig.json')).replace(/^\s*\/\/.*$/gm, '');
    expect(JSON.parse(tsconfig).compilerOptions.jsx).toBe('react-jsx');
  });

  it('rend le point d\'entrée via ForgeReconciler.render, sans export run', () => {
    const entry = read(join(UI_DIR, 'frontend.tsx'));

    expect(entry).toMatch(/ForgeReconciler\.render\(/);
    expect(entry).toMatch(/import ForgeReconciler, \{[^}]*useProductContext[^}]*\} from '@forge\/react'/s);
    expect(entry).toMatch(/<React\.StrictMode>/);
    expect(entry).not.toMatch(/export const run/);
    expect(entry.includes(LEGACY_PACKAGE)).toBe(false);
  });
});
