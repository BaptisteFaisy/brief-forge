/** Tests de `record-failed-attempt` : tentative abandonnée + commentaire court. */

jest.mock('@forge/api', () => require('./jiraApiStub').buildForgeApiMock());
jest.mock('../../../src/storage', () => require('./storageStub').buildStorageMock());

import { recordFailedAttempt } from '../../../src/actions/recordFailedAttempt';
import * as storage from '../../../src/storage';
import { denyPermission, jiraCalls, jiraCallsMatching, resetJiraStub } from './jiraApiStub';
import { AGENT_CONTEXT, mockOf } from './storageStub';

const logAccess = mockOf(storage.logAccess);
const saveAttempt = mockOf(storage.saveAttempt);

const PAYLOAD = {
  issueKey: 'PAY-142',
  summary: 'Rendre la clé d’idempotence déterministe',
  reason: 'le test de double envoi échoue sur la contrainte unique',
};

beforeEach(() => {
  resetJiraStub();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('enregistre une tentative abandonnée et commente le ticket', async () => {
  const result = await recordFailedAttempt(PAYLOAD, AGENT_CONTEXT);

  expect(result.ok).toBe(true);
  expect(result.issueKey).toBe('PAY-142');
  expect(typeof result.attemptId).toBe('string');
  expect(result.attemptId).not.toBe('');

  expect(saveAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      id: result.attemptId,
      issueKey: 'PAY-142',
      status: 'abandonné',
      userAccountId: 'acc-agent',
      agentName: 'claude-code',
    })
  );

  const [comment] = jiraCallsMatching('/comment');
  const posted = JSON.stringify(comment.body);
  expect(posted).toContain('Tentative abandonnée');
  expect(posted).toContain(PAYLOAD.reason);
  expect(posted).toContain('Rédigé par un agent (claude-code) pour le compte de (Baptiste)');

  // Écriture bornée : ni propriété, ni modification du ticket.
  expect(jiraCallsMatching('/properties')).toHaveLength(0);
  expect(jiraCalls().some((call) => call.method === 'PUT')).toBe(false);

  expect(logAccess).toHaveBeenCalledWith(
    'PAY-142',
    'record-failed-attempt',
    'acc-agent',
    expect.any(String)
  );
});

test('refuse explicitement quand le compte ne peut pas commenter', async () => {
  denyPermission('ADD_COMMENTS');

  const result = await recordFailedAttempt(PAYLOAD, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'WRITE_FORBIDDEN' });
  expect(jiraCallsMatching('/comment')).toHaveLength(0);
  expect(saveAttempt).not.toHaveBeenCalled();
});

test('refuse une raison vide et n’enregistre rien', async () => {
  const result = await recordFailedAttempt({ ...PAYLOAD, reason: '' }, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  expect(result.error).toContain('reason');
  expect(saveAttempt).not.toHaveBeenCalled();
  expect(jiraCalls()).toHaveLength(0);
});
