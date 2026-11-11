/** Tests de `claim-work` : réservation de 4 h, conflit, renouvellement. */

jest.mock('@forge/api', () => require('./jiraApiStub').buildForgeApiMock());
jest.mock('../../../src/storage', () => require('./storageStub').buildStorageMock());

import { claimWork } from '../../../src/actions/claimWork';
import { CLAIM_EXPIRY_HOURS } from '../../../src/config';
import * as storage from '../../../src/storage';
import { jiraCalls, resetJiraStub } from './jiraApiStub';
import { AGENT_CONTEXT, mockOf } from './storageStub';

const logAccess = mockOf(storage.logAccess);
const saveClaim = mockOf(storage.saveClaim);
const loadActiveClaim = mockOf(storage.loadActiveClaim);

const PAYLOAD = { issueKey: 'PAY-142', agentName: 'claude-code' };
const HOUR_MS = 3600 * 1000;

beforeEach(() => {
  resetJiraStub();
  jest.clearAllMocks();
  loadActiveClaim.mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('réserve un ticket libre pour la durée configurée', async () => {
  const before = Date.now();
  const result = await claimWork(PAYLOAD, AGENT_CONTEXT);

  expect(result.ok).toBe(true);
  expect(result.issueKey).toBe('PAY-142');
  expect(result.agentName).toBe('claude-code');
  expect(result.expiresInHours).toBe(CLAIM_EXPIRY_HOURS);

  expect(saveClaim).toHaveBeenCalledTimes(1);
  const saved = saveClaim.mock.calls[0][0];
  expect(saved).toMatchObject({
    issueKey: 'PAY-142',
    agentName: 'claude-code',
    userAccountId: 'acc-agent',
  });
  const delay = new Date(saved.expiresAt).getTime() - before;
  expect(delay).toBeGreaterThanOrEqual(CLAIM_EXPIRY_HOURS * HOUR_MS - 1000);
  expect(delay).toBeLessThanOrEqual(CLAIM_EXPIRY_HOURS * HOUR_MS + 60 * 1000);
  expect(result.expiresAt).toBe(saved.expiresAt);

  expect(logAccess).toHaveBeenCalledWith('PAY-142', 'claim-work', 'acc-agent', expect.any(String));
});

test('refuse un conflit en nommant le premier agent et son échéance', async () => {
  loadActiveClaim.mockResolvedValue({
    issueKey: 'PAY-142',
    agentName: 'cursor-agent',
    userAccountId: 'acc-2',
    expiresAt: '2026-11-11T18:00:00.000Z',
  });

  const result = await claimWork(PAYLOAD, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'CLAIM_CONFLICT' });
  expect(result.error).toContain('cursor-agent');
  expect(result.error).toContain('2026-11-11T18:00:00.000Z');
  expect(saveClaim).not.toHaveBeenCalled();
});

test('renouvelle la réservation du même agent sans conflit', async () => {
  loadActiveClaim.mockResolvedValue({
    issueKey: 'PAY-142',
    agentName: 'claude-code',
    userAccountId: 'acc-agent',
    expiresAt: '2026-11-11T18:00:00.000Z',
  });

  const result = await claimWork(PAYLOAD, AGENT_CONTEXT);

  expect(result.ok).toBe(true);
  expect(saveClaim).toHaveBeenCalledTimes(1);
});

test('ne touche ni au statut, ni à l’assigné, ni au sprint', async () => {
  await claimWork(PAYLOAD, AGENT_CONTEXT);

  expect(jiraCalls().every((call) => call.method === 'GET')).toBe(true);
  expect(jiraCalls().some((call) => call.path.includes('assignee'))).toBe(false);
});

test('refuse un appel sans identité dans le contexte', async () => {
  const result = await claimWork(PAYLOAD, {});

  // Le contrôle d'accès passe en premier : sans identité, pas d'accès.
  expect(result).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
  expect(saveClaim).not.toHaveBeenCalled();
  expect(jiraCalls()).toHaveLength(0);
});
