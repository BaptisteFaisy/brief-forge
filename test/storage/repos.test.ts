/** Tests des repos `claim`, `lesson`, `access_log` et `project_settings`. */

import { FakeSqlClient } from './fakeSqlClient';
import { SETTINGS, makeClaim, makeLesson } from './fixtures';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';
import {
  defaultClaimExpiry,
  loadActiveClaim,
  releaseClaim,
  saveClaim,
} from '../../src/storage/claimRepo';
import { loadLessons, loadProjectLessons, saveLesson } from '../../src/storage/lessonRepo';
import { loadAccessLog, logAccess, purgeOldAccessLogs } from '../../src/storage/accessLogRepo';
import { loadProjectSettings, saveProjectSettings } from '../../src/storage/projectSettingsRepo';

const NOW = new Date('2026-11-11T12:00:00.000Z');

describe('claimRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('pose une réservation de 4 h et la relit', async () => {
    const expiresAt = defaultClaimExpiry(NOW);
    await saveClaim(makeClaim(expiresAt));

    const claim = await loadActiveClaim('PAY-142', NOW);
    expect(claim).toMatchObject({ issueKey: 'PAY-142', agentName: 'rovo-agent', expiresAt });
    expect(expiresAt).toBe('2026-11-11T16:00:00.000Z');
  });

  it('ignore une réservation expirée', async () => {
    await saveClaim(makeClaim('2026-11-11T07:00:00.000Z'));
    expect(await loadActiveClaim('PAY-142', NOW)).toBeNull();
  });

  it('renvoie null sans réservation', async () => {
    expect(await loadActiveClaim('PAY-999', NOW)).toBeNull();
  });

  it('libère le ticket', async () => {
    await saveClaim(makeClaim(defaultClaimExpiry(NOW)));
    await releaseClaim('PAY-142');

    expect(fake.rowsOf('claim')).toHaveLength(0);
    expect(await loadActiveClaim('PAY-142', NOW)).toBeNull();
  });

  it('remplace la réservation existante (une seule par ticket)', async () => {
    await saveClaim(makeClaim(defaultClaimExpiry(NOW)));
    await saveClaim(makeClaim(defaultClaimExpiry(NOW), { agentName: 'autre-agent' }));

    expect(fake.rowsOf('claim')).toHaveLength(1);
    expect((await loadActiveClaim('PAY-142', NOW))?.agentName).toBe('autre-agent');
  });
});

describe('lessonRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('déduit le projet du ticket et trie par date décroissante', async () => {
    await saveLesson(makeLesson({ id: 'l-old', createdAt: '2026-10-01T08:00:00.000Z' }));
    await saveLesson(makeLesson({ id: 'l-new', createdAt: '2026-11-05T08:00:00.000Z' }));
    await saveLesson(makeLesson({ id: 'l-ops', projectKey: 'OPS' }));

    const lessons = await loadLessons('PAY-142');
    expect(lessons.map((lesson) => lesson.id)).toEqual(['l-new', 'l-old']);
  });

  it('filtre par composant quand il est fourni', async () => {
    await saveLesson(makeLesson({ id: 'l-billing', component: 'billing' }));
    await saveLesson(makeLesson({ id: 'l-search', component: 'search' }));

    const lessons = await loadLessons('PAY-142', 'search');
    expect(lessons.map((lesson) => lesson.id)).toEqual(['l-search']);
    expect(lessons[0].text).toContain('idempotence');
  });

  it('liste les leçons d’un projet entier', async () => {
    await saveLesson(makeLesson({ id: 'l-1' }));
    await saveLesson(makeLesson({ id: 'l-2', component: 'search' }));

    expect(await loadProjectLessons('PAY')).toHaveLength(2);
    expect(fake.rowsOf('lesson')).toHaveLength(2);
  });
});

describe('accessLogRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('journalise un accès horodaté avec un identifiant UUID', async () => {
    await logAccess('PAY-142', 'get-work-brief', 'acc-1', '2026-11-11T10:00:00.000Z');

    const [row] = fake.rowsOf('access_log');
    expect(row).toMatchObject({
      issue_key: 'PAY-142',
      tool: 'get-work-brief',
      user_account_id: 'acc-1',
      at: '2026-11-11T10:00:00.000Z',
    });
    expect(String(row.id)).toHaveLength(36);
  });

  it('relit les accès du ticket, les plus récents d’abord', async () => {
    await logAccess('PAY-142', 'get-work-brief', 'acc-1', '2026-11-10T10:00:00.000Z');
    await logAccess('PAY-142', 'check-readiness', 'acc-2', '2026-11-11T10:00:00.000Z');
    await logAccess('OPS-7', 'get-work-brief', 'acc-1', '2026-11-11T11:00:00.000Z');

    const entries = await loadAccessLog('PAY-142');
    expect(entries.map((entry) => entry.tool)).toEqual(['check-readiness', 'get-work-brief']);
    expect(entries[0].userAccountId).toBe('acc-2');
  });

  it('purge les traces au-delà de la rétention de 90 jours', async () => {
    await logAccess('PAY-142', 'ancien', 'acc-1', '2026-06-01T10:00:00.000Z');
    await logAccess('PAY-142', 'récent', 'acc-1', '2026-11-10T10:00:00.000Z');

    await purgeOldAccessLogs(NOW);

    const entries = await loadAccessLog('PAY-142');
    expect(entries.map((entry) => entry.tool)).toEqual(['récent']);
  });
});

describe('projectSettingsRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => resetSqlClient());

  it('sérialise les réglages en JSON', async () => {
    await saveProjectSettings(SETTINGS);

    const [row] = fake.rowsOf('project_settings');
    expect(row.project_key).toBe('PAY');
    expect(JSON.parse(String(row.settings_json))).toEqual(SETTINGS);
    expect(String(row.updated_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('relit les réglages à l’identique', async () => {
    await saveProjectSettings(SETTINGS);
    expect(await loadProjectSettings('PAY')).toEqual(SETTINGS);
  });

  it('renvoie null si le projet est inconnu', async () => {
    expect(await loadProjectSettings('NOPE')).toBeNull();
  });

  it('renvoie null si le JSON stocké est illisible', async () => {
    await saveProjectSettings(SETTINGS);
    await fake.execute('UPDATE project_settings SET settings_json = ? WHERE project_key = ?', [
      '{invalide',
      'PAY',
    ]);

    expect(await loadProjectSettings('PAY')).toBeNull();
  });
});
