/**
 * Tests de la boucle d'apprentissage : revue humaine → leçon → brief (BC-14).
 *
 * Aucun réseau : le faux client SQL en mémoire de la couche stockage suffit
 * (`recordReview` et `lessonsForIssue` ne passent que par les repos).
 */

import { FakeSqlClient } from '../storage/fakeSqlClient';
import { SETTINGS, makeAttempt, makeLesson } from '../storage/fixtures';
import { saveAttempt } from '../../src/storage/attemptRepo';
import { saveLesson } from '../../src/storage/lessonRepo';
import { saveProjectSettings } from '../../src/storage/projectSettingsRepo';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';
import {
  DEFAULT_LESSON_LIMIT,
  isUsableNote,
  lessonsForIssue,
  normalizeVerdict,
  recordReview,
} from '../../src/review';

const NOW = new Date('2026-11-12T09:00:00.000Z');
const NOTE = 'Toujours rejouer avec la clé d’idempotence avant de débiter.';

const REPORT_WITH_ZONE = [
  '## Statut : partiel',
  '## Composant : billing',
  '## Fait : rejeu partiel',
].join('\n');

describe('recordReview', () => {
  let fake: FakeSqlClient;

  beforeEach(async () => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
    await saveAttempt(makeAttempt({ id: 'att-1', issueKey: 'PAY-142', reportMd: REPORT_WITH_ZONE }));
  });

  afterEach(() => resetSqlClient());

  it('transforme une correction en leçon rattachée au projet et à la zone', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.lessonCreated).toBe(true);
    expect(result.lessonSkippedReason).toBeNull();
    expect(result.projectKey).toBe('PAY');
    expect(result.component).toBe('billing');
    expect(result.lesson).toMatchObject({
      projectKey: 'PAY',
      component: 'billing',
      sourceAttemptId: 'att-1',
      createdAt: NOW.toISOString(),
    });
    expect(result.lesson?.text).toBe(`PAY-142 — ${NOTE}`);
    expect(fake.rowsOf('lesson')).toHaveLength(1);
  });

  it('enregistre la revue en même temps que la leçon', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.review).toMatchObject({
      issueKey: 'PAY-142',
      attemptId: 'att-1',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      commentMd: NOTE,
      createdAt: NOW.toISOString(),
    });
    expect(fake.rowsOf('review')).toHaveLength(1);
  });

  it('n’écrit aucune leçon pour une correction sans note', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: '   ',
      now: NOW,
    });

    expect(result.lesson).toBeNull();
    expect(result.lessonCreated).toBe(false);
    expect(result.lessonSkippedReason).toBe('note-vide');
    expect(fake.rowsOf('lesson')).toHaveLength(0);
    expect(fake.rowsOf('review')).toHaveLength(1);
  });

  it('n’écrit aucune leçon pour une note trop courte ou sans texte', async () => {
    const courte = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: 'ok',
      now: NOW,
    });
    const ponctuation = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: '… … … … …',
      now: NOW,
    });

    expect(courte.lessonSkippedReason).toBe('note-trop-courte');
    expect(ponctuation.lessonSkippedReason).toBe('note-trop-courte');
    expect(fake.rowsOf('lesson')).toHaveLength(0);
    expect(fake.rowsOf('review')).toHaveLength(2);
  });

  it('ne duplique pas la leçon quand la même tentative est corrigée deux fois', async () => {
    const premier = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });
    const second = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Bob',
      verdict: 'corrigé',
      note: 'Autre correction, plus précise, du même compte rendu.',
      now: new Date('2026-11-12T10:00:00.000Z'),
    });

    expect(premier.lessonCreated).toBe(true);
    expect(second.lessonCreated).toBe(false);
    expect(second.lessonSkippedReason).toBe('leçon-déjà-existante');
    expect(second.lesson?.id).toBe(premier.lesson?.id);
    expect(fake.rowsOf('lesson')).toHaveLength(1);
    expect(fake.rowsOf('review')).toHaveLength(2);
  });

  it('n’écrit aucune leçon pour une confirmation', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'confirmé',
      note: NOTE,
      now: NOW,
    });

    expect(result.lesson).toBeNull();
    expect(result.lessonSkippedReason).toBe('verdict-confirmé');
    expect(fake.rowsOf('lesson')).toHaveLength(0);
  });

  it('fait primer le composant explicite de l’appelant sur le compte rendu', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-142',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      component: 'search',
      now: NOW,
    });

    expect(result.component).toBe('search');
    expect(result.lesson?.component).toBe('search');
  });

  it('retombe sur la zone du projet quand le compte rendu n’en déclare pas', async () => {
    await saveProjectSettings(SETTINGS);
    await saveAttempt(makeAttempt({ id: 'att-2', issueKey: 'PAY-7', reportMd: '## Statut : bloqué' }));

    const result = await recordReview({
      attemptId: 'att-2',
      issueKey: 'PAY-7',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.component).toBe('billing');
    expect(result.lesson?.projectKey).toBe('PAY');
  });

  it('écrit une leçon de projet quand aucune zone n’est connue', async () => {
    await saveAttempt(makeAttempt({ id: 'att-3', issueKey: 'OPS-9', reportMd: '## Statut : bloqué' }));

    const result = await recordReview({
      attemptId: 'att-3',
      issueKey: 'OPS-9',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.projectKey).toBe('OPS');
    expect(result.component).toBe('');
    expect(result.lesson?.component).toBe('');
  });

  it('relit le ticket de la tentative enregistrée', async () => {
    const result = await recordReview({
      attemptId: 'att-1',
      issueKey: 'PAY-999',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.review.issueKey).toBe('PAY-142');
    expect(result.lesson?.text).toContain('PAY-142');
  });

  it('journalise une revue même si la tentative a disparu', async () => {
    const result = await recordReview({
      attemptId: 'att-inconnu',
      issueKey: 'PAY-142',
      reviewerName: '',
      verdict: 'Corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.review.reviewerName).toBe('inconnu');
    expect(result.review.verdict).toBe('corrigé');
    expect(result.lesson?.sourceAttemptId).toBe('att-inconnu');
  });

  it('n’écrit aucune leçon si le projet ne peut pas être déduit', async () => {
    const result = await recordReview({
      attemptId: 'att-inconnu',
      issueKey: '',
      reviewerName: 'Alice',
      verdict: 'corrigé',
      note: NOTE,
      now: NOW,
    });

    expect(result.projectKey).toBe('');
    expect(result.lesson).toBeNull();
    expect(result.lessonSkippedReason).toBe('projet-inconnu');
    expect(fake.rowsOf('lesson')).toHaveLength(0);
    expect(fake.rowsOf('review')).toHaveLength(1);
  });
});

describe('lessonsForIssue', () => {
  let fake: FakeSqlClient;

  beforeEach(async () => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('ne retient que les leçons du projet, de la zone visée ou sans zone', async () => {
    await saveLesson(makeLesson({ id: 'l-billing', component: 'billing' }));
    await saveLesson(makeLesson({ id: 'l-search', component: 'search' }));
    await saveLesson(makeLesson({ id: 'l-projet', component: '' }));
    await saveLesson(makeLesson({ id: 'l-ops', projectKey: 'OPS', component: 'billing' }));

    const lessons = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });

    expect(lessons.map((lesson) => lesson.id).sort()).toEqual(['l-billing', 'l-projet']);
  });

  it('trie de la plus récente à la plus ancienne', async () => {
    await saveLesson(makeLesson({ id: 'l-vieux', createdAt: '2026-01-05T08:00:00.000Z' }));
    await saveLesson(makeLesson({ id: 'l-recent', createdAt: '2026-11-05T08:00:00.000Z' }));
    await saveLesson(makeLesson({ id: 'l-median', createdAt: '2026-06-05T08:00:00.000Z' }));

    const lessons = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });

    expect(lessons.map((lesson) => lesson.id)).toEqual(['l-recent', 'l-median', 'l-vieux']);
  });

  it('marque ancienne une leçon de plus de 18 mois sans la retirer', async () => {
    await saveLesson(makeLesson({ id: 'l-ancien', createdAt: '2024-06-01T08:00:00.000Z' }));
    await saveLesson(makeLesson({ id: 'l-recent', createdAt: '2026-06-01T08:00:00.000Z' }));

    const lessons = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });
    const ancien = lessons.find((lesson) => lesson.id === 'l-ancien');
    const recent = lessons.find((lesson) => lesson.id === 'l-recent');

    expect(ancien?.stale).toBe(true);
    expect(ancien?.ageMonths).toBe(29);
    expect(recent?.stale).toBe(false);
    expect(recent?.ageMonths).toBe(5);
  });

  it('accepte un âge maximal configurable', async () => {
    await saveLesson(makeLesson({ id: 'l-8mois', createdAt: '2026-03-01T08:00:00.000Z' }));

    const lessons = await lessonsForIssue('PAY-142', {
      component: 'billing',
      maxAgeMonths: 6,
      now: NOW,
    });

    expect(lessons[0]?.stale).toBe(true);
  });

  it('donne la provenance de la tentative d’origine', async () => {
    await saveAttempt(makeAttempt({ id: 'att-1', issueKey: 'PAY-140', agentName: 'cursor' }));
    await saveLesson(makeLesson({ id: 'l-1', sourceAttemptId: 'att-1' }));

    const [lesson] = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });

    expect(lesson?.source).toEqual({
      attemptId: 'att-1',
      issueKey: 'PAY-140',
      agentName: 'cursor',
      startedAt: '2026-11-10T10:00:00.000Z',
    });
  });

  it('laisse la provenance nulle si la tentative a disparu', async () => {
    await saveLesson(makeLesson({ id: 'l-1', sourceAttemptId: 'att-effacé' }));

    const [lesson] = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });

    expect(lesson?.source).toBeNull();
  });

  it('borne le nombre de leçons renvoyées', async () => {
    for (let index = 0; index < DEFAULT_LESSON_LIMIT + 5; index += 1) {
      await saveLesson(makeLesson({ id: `l-${index}` }));
    }

    const lessons = await lessonsForIssue('PAY-142', { component: 'billing', now: NOW });

    expect(lessons).toHaveLength(DEFAULT_LESSON_LIMIT);
  });

  it('renvoie une liste vide pour un projet sans leçon', async () => {
    expect(await lessonsForIssue('VIDE-1', { now: NOW })).toEqual([]);
  });
});

describe('normalisation des entrées', () => {
  it('normalise le verdict (casse, accents, synonyme)', () => {
    expect(normalizeVerdict('Corrigé')).toBe('corrigé');
    expect(normalizeVerdict('CORRIGE')).toBe('corrigé');
    expect(normalizeVerdict('correction')).toBe('corrigé');
    expect(normalizeVerdict('confirmé')).toBe('confirmé');
    expect(normalizeVerdict('CONFIRME')).toBe('confirmé');
    expect(normalizeVerdict('')).toBe('confirmé');
  });

  it('reconnaît une note exploitable', () => {
    expect(isUsableNote(NOTE)).toBe(true);
    expect(isUsableNote('   ')).toBe(false);
    expect(isUsableNote('ok')).toBe(false);
    expect(isUsableNote('… … … … …')).toBe(false);
    expect(isUsableNote('Voir l’ADR-12')).toBe(true);
  });
});
