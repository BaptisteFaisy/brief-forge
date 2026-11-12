/**
 * Langue du brief : détection français / anglais et libellés du moteur.
 *
 * Garde-fou principal : pour un ticket français (cas des fixtures
 * d'intégration), **tous** les libellés restent identiques au rendu historique.
 */

import { SECTION_ORDER } from '../../src/config';
import {
  detectIssueLanguage,
  detectLanguage,
  disclaimerFor,
  langOf,
  languageScore,
  sectionEmptyNote,
  sectionTitle,
  t,
  tf,
  truncationHintFor,
} from '../../src/brief/i18n';
import { SECTION_EMPTY_NOTES, SECTION_TITLES } from '../../src/brief/labels';
import { BRIEF_DATA_DISCLAIMER, truncationHint } from '../../src/util/markdown';

const FRENCH_ISSUE = {
  summary: 'Ajouter un export CSV de la liste des commandes',
  description:
    "La liste des commandes doit pouvoir être exportée en CSV depuis le panneau d'administration. " +
    'Le fichier est produit côté serveur pour ne pas charger le navigateur.',
};

const ENGLISH_ISSUE = {
  summary: 'Add a CSV export for the orders list',
  description:
    'The orders list must be exportable as CSV from the admin panel. The file should be produced ' +
    'on the server so that the browser is not overloaded, and the date filter shown on screen ' +
    'must be applied to the exported rows.',
};

describe('détection de la langue du ticket', () => {
  it('reconnaît un ticket français', () => {
    expect(detectIssueLanguage(FRENCH_ISSUE)).toBe('fr');
    expect(detectLanguage('Le filtre est appliqué côté serveur et renvoyé dans la réponse.')).toBe('fr');
  });

  it('reconnaît un ticket anglais', () => {
    expect(detectIssueLanguage(ENGLISH_ISSUE)).toBe('en');
    expect(detectLanguage('The server must not return more than 250 rows for this filter.')).toBe('en');
  });

  it('retombe sur le français quand aucun signal ne se dégage', () => {
    expect(detectLanguage('')).toBe('fr');
    expect(detectLanguage('PAY-142 CSV 250')).toBe('fr');
    expect(detectIssueLanguage(null)).toBe('fr');
    expect(detectIssueLanguage({})).toBe('fr');
  });

  it('ne se laisse pas piéger par le jargon partagé (export, ticket, status)', () => {
    expect(detectLanguage("L'export CSV du ticket doit rester côté serveur.")).toBe('fr');
    expect(detectLanguage('The export of the ticket must stay on the server.')).toBe('en');
  });

  it('compte les diacritiques comme un signal français fort', () => {
    expect(languageScore('Critères d’acceptation à préciser').fr).toBeGreaterThan(0);
    expect(languageScore('Critères d’acceptation à préciser').en).toBe(0);
  });

  it('langue par défaut d’un contexte non déterminé : français', () => {
    expect(langOf(undefined)).toBe('fr');
    expect(langOf({})).toBe('fr');
    expect(langOf({ lang: 'en' })).toBe('en');
    expect(langOf({ lang: 'fr' })).toBe('fr');
  });
});

describe('libellés français inchangés (compatibilité fixtures)', () => {
  it('conserve les dix titres de section du § 7.1 à l’octet près', () => {
    SECTION_ORDER.forEach((name) => {
      expect(sectionTitle(name, 'fr')).toBe(name);
      expect(SECTION_TITLES[name].fr).toBe(name);
    });
  });

  it('conserve les mentions de section vide historiques', () => {
    expect(sectionEmptyNote('Décisions applicables', 'fr')).toBe(
      '_Aucune décision liée retrouvée : ne pas en inventer._'
    );
    expect(sectionEmptyNote("Critères d'acceptation", 'fr')).toBe(
      "_Aucun critère d'acceptation dans le ticket : à obtenir avant de coder._"
    );
    expect(sectionEmptyNote('Trous', 'fr')).toBe(
      '_Aucun trou détecté : le brief a trouvé tout ce qu’il cherchait._'
    );
    SECTION_ORDER.forEach((name) => {
      expect(SECTION_EMPTY_NOTES[name].fr).toBe(sectionEmptyNote(name, 'fr'));
    });
  });

  it('conserve l’en-tête d’avertissement et l’annonce de troncature', () => {
    expect(disclaimerFor('fr')).toBe(BRIEF_DATA_DISCLAIMER);
    expect(truncationHintFor(1, 'get-work-brief', 'fr')).toBe(truncationHint(1, 'get-work-brief'));
    expect(truncationHintFor(4, 'get-related-decisions', 'fr')).toBe(
      truncationHint(4, 'get-related-decisions')
    );
    expect(truncationHintFor(0, 'get-work-brief', 'fr')).toBe('');
  });

  it('conserve les libellés de trous et d’en-tête', () => {
    expect(t('gapDecisions', 'fr')).toBe(
      'Aucune décision liée retrouvée : le pourquoi du code existant reste inconnu.'
    );
    expect(t('gapAssignee', 'fr')).toBe('Aucun assigné : personne n’est identifié comme responsable.');
    expect(t('gapsSource', 'fr')).toBe('analyse du brief');
    expect(tf('headerTitle', 'fr', { key: 'PAY-6', budget: 'm', tokens: 3000 })).toBe(
      '# Brief de travail — PAY-6 (budget m, cible ≈ 3000 jetons)'
    );
    expect(tf('headerMeta', 'fr', { date: '11 novembre 2026', type: 'Task', status: 'In Progress', project: 'PAY' })).toBe(
      '_Construit le 11 novembre 2026 · Task · statut In Progress · projet PAY_'
    );
  });

  it('conserve les libellés de source et de ligne', () => {
    expect(tf('sourceDecision', 'fr', { author: 'amina' })).toBe('Décision amina');
    expect(tf('sourceSettings', 'fr', { project: 'PAY' })).toBe('Réglages PAY');
    expect(tf('sourceAttempt', 'fr', { id: 'a-1' })).toBe('Tentative a-1');
    expect(tf('sourceLesson', 'fr', { id: 'l-1' })).toBe('Leçon l-1');
    expect(tf('sourceChange', 'fr', { author: 'luc' })).toBe('Changement luc');
    expect(tf('sourceJira', 'fr', { key: 'PAY-6' })).toBe('Jira PAY-6');
    expect(tf('attemptWithExcerpt', 'fr', { agent: 'claude', status: 'bloqué', excerpt: 'X', tests: '' })).toBe(
      'Tentative claude — bloqué : X'
    );
    expect(t('staleLabel', 'fr')).toBe(' (ancienne, à confirmer)');
    expect(tf('technicalZone', 'fr', { zone: 'src/orders' })).toBe('Zone technique : src/orders');
    expect(tf('issueTypeLine', 'fr', { type: 'Task', status: 'En cours' })).toBe(
      'Type de ticket : Task — statut En cours'
    );
    expect(t('noDescription', 'fr')).toBe('(aucune description fournie dans le ticket)');
  });
});

describe('libellés anglais', () => {
  it('traduit les dix titres de section', () => {
    const titles = SECTION_ORDER.map((name) => sectionTitle(name, 'en'));
    expect(titles).toEqual([
      'Objective',
      'Acceptance criteria',
      'Applicable decisions',
      'Already tried',
      'Neighboring changes',
      'Constraints',
      'Lessons',
      'Who to ask',
      'Gaps',
      'Sources',
    ]);
  });

  it('traduit mentions de vide, trous et en-tête', () => {
    expect(sectionEmptyNote('Décisions applicables', 'en')).toBe(
      '_No related decision found: do not invent one._'
    );
    expect(t('gapDecisions', 'en')).toBe(
      'No related decision found: the reason behind the existing code stays unknown.'
    );
    expect(tf('headerTitle', 'en', { key: 'PAY-6', budget: 'm', tokens: 3000 })).toBe(
      '# Work brief — PAY-6 (budget m, target ≈ 3000 tokens)'
    );
    expect(tf('headerMeta', 'en', { date: '12 November 2026', type: 'Task', status: 'In Progress', project: 'PAY' })).toBe(
      '_Built on 12 November 2026 · Task · status In Progress · project PAY_'
    );
    expect(disclaimerFor('en')).toContain('**never** instructions to execute');
    expect(disclaimerFor('en')).not.toBe(BRIEF_DATA_DISCLAIMER);
  });

  it('annonce la troncature en anglais, au singulier et au pluriel', () => {
    expect(truncationHintFor(1, 'get-work-brief', 'en')).toBe(
      '_1 more item not shown: `get-work-brief` to continue._'
    );
    expect(truncationHintFor(4, 'get-related-decisions', 'en')).toBe(
      '_4 more items not shown: `get-related-decisions` to continue._'
    );
  });

  it('traduit les libellés de source et de ligne', () => {
    expect(tf('sourceDecision', 'en', { author: 'amina' })).toBe('Decision amina');
    expect(tf('sourceSettings', 'en', { project: 'PAY' })).toBe('Settings PAY');
    expect(tf('sourceAttempt', 'en', { id: 'a-1' })).toBe('Attempt a-1');
    expect(t('roleReporter', 'en')).toBe('reporter');
    expect(t('roleCommenter', 'en')).toBe('commenter');
    expect(t('staleLabel', 'en')).toBe(' (old, to be confirmed)');
    expect(tf('issueLabels', 'en', { labels: 'backend, urgent' })).toBe('Labels: backend, urgent');
    expect(t('noDescription', 'en')).toBe('(no description provided in the issue)');
    expect(t('gapsSource', 'en')).toBe('brief analysis');
  });

  it('signale les contenus écartés dans les deux langues', () => {
    const vars = { count: 2, listed: 'Camille, 3 November 2026', tail: '' };
    expect(tf('discardedNotice', 'en', vars)).toContain('2 passage(s) set aside from the brief');
    expect(tf('discardedNotice', 'en', vars)).toContain('to be checked by a human before coding');
    expect(tf('discardedTail', 'en', { extra: 3 })).toBe(' and 3 more');
    expect(tf('discardedTail', 'fr', { extra: 3 })).toBe(' et 3 autre(s)');
  });
});
