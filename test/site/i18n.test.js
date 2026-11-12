/** @jest-environment jsdom */

const i18n = require('../../site/assets/i18n.js');

function resetDom() {
  document.documentElement.lang = 'fr';
  document.head.innerHTML = '<meta name="description" content="">';
  document.title = '';
  const el = document.createElement('div');
  el.setAttribute('data-i18n', 'hero.title');
  document.body.appendChild(el);
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="description" content="">';
  localStorage.clear();
  i18n.setLang('fr');
});

describe('i18n', () => {
  test('t returns French by default with variable substitution', () => {
    expect(i18n.t('readiness.score')).toBe('Score');
    expect(i18n.t('demo.budget.m')).toBe('moyen');
  });

  test('t falls back to French key and then the key itself', () => {
    expect(i18n.t('demo.liveBadge')).toBe('Brief réel · app déployée');
    expect(i18n.t('missing.key')).toBe('missing.key');
  });

  test('setLang switches to English and persists in localStorage', () => {
    i18n.setLang('en');
    expect(i18n.currentLang()).toBe('en');
    expect(i18n.t('readiness.score')).toBe('Score');
    expect(i18n.t('demo.budget.m')).toBe('medium');
    expect(localStorage.getItem('brief-forge:lang')).toBe('en');
  });

  test('apply updates [data-i18n] text and the html lang attribute', () => {
    resetDom();
    i18n.setLang('fr');
    document.body.innerHTML = '<p data-i18n="demo.copy"></p>';
    i18n.apply(document);
    expect(document.querySelector('[data-i18n]').textContent).toBe('Copier le brief');
    expect(document.documentElement.lang).toBe('fr');
  });

  test('init defaults to the browser language when no stored value', () => {
    localStorage.clear();
    Object.defineProperty(navigator, 'language', { value: 'en-GB', configurable: true });
    i18n.init();
    expect(i18n.currentLang()).toBe('en');
  });

  test('init keeps a stored language over the browser one', () => {
    localStorage.setItem('brief-forge:lang', 'fr');
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    i18n.init();
    expect(i18n.currentLang()).toBe('fr');
  });
});