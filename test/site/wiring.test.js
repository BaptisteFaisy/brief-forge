/**
 * Câblage du site public : aucune référence cassée entre les trois fichiers.
 *
 * Le site est servi statiquement par GitHub Pages : une id manquante ou une clé
 * de traduction absente ne fait pas échouer un build, elle laisse juste un trou
 * visible. Ce test croise donc `index.html`, `app.js`/`demo.js` et `i18n.js`
 * sans navigateur :
 *   1. toute id / sélecteur `#…` utilisé par le JS existe dans le HTML ;
 *   2. toute clé `data-i18n` du HTML existe dans le dictionnaire ;
 *   3. les dictionnaires FR et EN ont exactement les mêmes clés (parité) ;
 *   4. le HTML ne charge aucune ressource externe (ni CDN, ni police distante) ;
 *   5. tous les chemins d'assets sont **relatifs** (le site vit sous /brief-forge/).
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

const html = read('site/index.html');
const app = read('site/assets/app.js');
const demo = read('site/assets/demo.js');
const i18nSource = read('site/assets/i18n.js');

/** Identifiants déclarés dans le HTML. */
function htmlIds(source) {
  return new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/** Sélecteurs par id utilisés dans le JS (`#foo`, `getElementById('foo')`). */
function jsIdRefs(source) {
  const refs = new Set();
  for (const m of source.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) refs.add(m[1]);
  for (const m of source.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)/g)) refs.add(m[1]);
  return refs;
}

/** Clés de traduction utilisées (attributs HTML et appels `t('…')`). */
function usedI18nKeys() {
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const src of [app, demo]) {
    for (const m of src.matchAll(/\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]/g)) keys.add(m[1]);
  }
  return keys;
}

/** Clés déclarées dans un bloc de dictionnaire (`fr: { … }` / `en: { … }`). */
function dictionaryKeys(lang) {
  const start = i18nSource.indexOf(`${lang}: {`);
  if (start < 0) return new Set();
  let depth = 0;
  let end = start;
  for (let i = start + lang.length + 2; i < i18nSource.length; i += 1) {
    if (i18nSource[i] === '{') depth += 1;
    if (i18nSource[i] === '}') {
      if (depth === 0) {
        end = i;
        break;
      }
      depth -= 1;
    }
  }
  const block = i18nSource.slice(start, end);
  return new Set([...block.matchAll(/^\s*'([A-Za-z0-9_.-]+)'\s*:/gm)].map((m) => m[1]));
}

describe('site public — câblage', () => {
  it('toute id utilisée par le JS existe dans le HTML', () => {
    const ids = htmlIds(html);
    const missing = [...jsIdRefs(`${app}\n${demo}`)].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('toute clé data-i18n du HTML est traduite', () => {
    const fr = dictionaryKeys('fr');
    const missing = [...usedI18nKeys()].filter((key) => !fr.has(key));
    expect(missing).toEqual([]);
  });

  it('les dictionnaires français et anglais ont les mêmes clés', () => {
    const fr = dictionaryKeys('fr');
    const en = dictionaryKeys('en');
    expect(fr.size).toBeGreaterThan(50);
    expect([...fr].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !fr.has(k))).toEqual([]);
  });

  it('aucune **ressource** externe : pas de CDN, pas de police distante', () => {
    // Les liens sortants (dépôt, docs, endpoint MCP) sont voulus : ce qui est
    // interdit, ce sont les sous-ressources chargées par la page — le visiteur
    // ne doit dépendre d'aucun tiers pour voir la démo.
    const loaded = [
      ...html.matchAll(/<script[^>]+\ssrc="(https?:)?\/\/[^"]+"/g),
      ...html.matchAll(/<link[^>]+\shref="(https?:)?\/\/[^"]+"/g),
      ...html.matchAll(/<img[^>]+\ssrc="(https?:)?\/\/[^"]+"/g),
      ...html.matchAll(/<iframe[^>]+\ssrc="(https?:)?\/\/[^"]+"/g),
    ].map((m) => m[0]);
    const css = read('site/assets/style.css');
    const cssExternal = [
      ...css.matchAll(/@import[^;]*url\(\s*['"]?(https?:)?\/\/[^)]*\)/g),
      ...css.matchAll(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/g),
    ].map((m) => m[0]);
    expect(loaded).toEqual([]);
    expect(cssExternal).toEqual([]);
  });

  it('les liens sortants pointent vers des destinations attendues', () => {
    const allowed = [
      'https://github.com/BaptisteFaisy/brief-forge',
      'https://developer.atlassian.com/',
      'https://mcp.atlassian.com/forge/',
      'https://one-atlas-cndz.atlassian.net',
      'https://codegeist2026.devpost.com/',
    ];
    const outside = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((url) => !allowed.some((prefix) => url.startsWith(prefix)));
    expect(outside).toEqual([]);
  });

  it('les assets sont en chemin relatif (site servi sous /brief-forge/)', () => {
    const absolute = [...html.matchAll(/(?:href|src)="\/[^/][^"]*"/g)].map((m) => m[0]);
    expect(absolute).toEqual([]);
    expect(html).toContain('href="assets/style.css"');
  });
});
