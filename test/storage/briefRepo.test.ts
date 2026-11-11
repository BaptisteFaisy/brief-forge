/** Tests du repo `brief` : upsert, lecture, péremption des trois budgets. */

import { FakeSqlClient } from './fakeSqlClient';
import { BUILT_AT, makeBrief } from './fixtures';
import { resetSqlClient, setSqlClient } from '../../src/storage/sqlClient';
import { hasStaleBrief, loadBrief, markBriefStale, saveBrief } from '../../src/storage/briefRepo';

describe('briefRepo', () => {
  let fake: FakeSqlClient;

  beforeEach(() => {
    fake = new FakeSqlClient();
    setSqlClient(fake);
  });

  afterEach(() => {
    resetSqlClient();
  });

  it('enregistre le brief avec markdown, JSON et sources', async () => {
    const brief = makeBrief();
    await saveBrief(brief, BUILT_AT);

    const [row] = fake.rowsOf('brief');
    expect(row.issue_key).toBe('PAY-142');
    expect(row.budget).toBe('m');
    expect(row.content_md).toBe(brief.markdown);
    expect(row.built_at).toBe(BUILT_AT);
    expect(row.stale).toBe(0);
    expect(JSON.parse(String(row.content_json)).objective).toBe(brief.objective);
    expect(JSON.parse(String(row.sources_json))).toHaveLength(1);
  });

  it('relit le brief sous forme typée', async () => {
    await saveBrief(makeBrief('PAY-142', 'l'), BUILT_AT);
    const stored = await loadBrief('PAY-142', 'l');

    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({ issueKey: 'PAY-142', budget: 'l', stale: false, builtAt: BUILT_AT });
  });

  it('renvoie null si le brief est absent', async () => {
    expect(await loadBrief('PAY-999', 's')).toBeNull();
  });

  it('sépare les trois budgets d’un même ticket', async () => {
    await saveBrief(makeBrief('PAY-142', 's'), BUILT_AT);
    await saveBrief(makeBrief('PAY-142', 'm'), BUILT_AT);
    await saveBrief(makeBrief('PAY-142', 'l'), BUILT_AT);

    expect(fake.rowsOf('brief')).toHaveLength(3);
    expect((await loadBrief('PAY-142', 's'))?.budget).toBe('s');
  });

  it('marque tous les budgets comme périmés en une instruction', async () => {
    await saveBrief(makeBrief('PAY-142', 's'), BUILT_AT);
    await saveBrief(makeBrief('PAY-142', 'm'), BUILT_AT);
    await saveBrief(makeBrief('PAY-142', 'l'), BUILT_AT);
    await saveBrief(makeBrief('OPS-7', 'm'), BUILT_AT);

    await markBriefStale('PAY-142');

    const payRows = fake.rowsOf('brief').filter((row) => row.issue_key === 'PAY-142');
    expect(payRows).toHaveLength(3);
    expect(payRows.every((row) => row.stale === 1)).toBe(true);
    expect(fake.rowsOf('brief').find((row) => row.issue_key === 'OPS-7')?.stale).toBe(0);
    expect(await hasStaleBrief('PAY-142')).toBe(true);
    expect(await hasStaleBrief('OPS-7')).toBe(false);
  });

  it('remet stale à false lors d’une reconstruction', async () => {
    await saveBrief(makeBrief(), BUILT_AT);
    await markBriefStale('PAY-142');
    await saveBrief(makeBrief(), '2026-11-11T10:00:00.000Z');

    expect((await loadBrief('PAY-142', 'm'))?.stale).toBe(false);
    expect(fake.rowsOf('brief')).toHaveLength(1);
  });
});
