/** Tests de `post-work-report` : statut strict, signature, avertissement tests. */

jest.mock('@forge/api', () => require('./jiraApiStub').buildForgeApiMock());
jest.mock('../../../src/storage', () => require('./storageStub').buildStorageMock());

import { postWorkReport } from '../../../src/actions/postWorkReport';
import * as storage from '../../../src/storage';
import {
  denyPermission,
  jiraCalls,
  jiraCallsMatching,
  resetJiraStub,
} from './jiraApiStub';
import { AGENT_CONTEXT, mockOf } from './storageStub';

const logAccess = mockOf(storage.logAccess);
const saveAttempt = mockOf(storage.saveAttempt);
const hasStaleBrief = mockOf(storage.hasStaleBrief);

const PAYLOAD = {
  issueKey: 'PAY-142',
  status: 'terminé',
  report: '## Fait\n- clé d’idempotence ajoutée',
  criteriaCovered: '1, 2',
};

beforeEach(() => {
  resetJiraStub();
  jest.clearAllMocks();
  hasStaleBrief.mockResolvedValue(false);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('poste un compte rendu signé et signale l’absence de tests', async () => {
  const result = await postWorkReport(PAYLOAD, AGENT_CONTEXT);

  expect(result.ok).toBe(true);
  expect(result.issueKey).toBe('PAY-142');
  expect(result.commentUrl).toContain('focusedCommentId=comment-1001');
  expect(result.warning).toContain('non vérifié par des tests');

  const [comment] = jiraCallsMatching('/comment');
  const posted = JSON.stringify(comment.body);
  expect(posted).toContain('Statut : terminé');
  expect(posted).toContain('Critères couverts : 1, 2');
  expect(posted).toContain('non vérifié par des tests');
  expect(posted).toContain(
    'Rédigé par un agent (claude-code) pour le compte de (Baptiste)'
  );

  const [property] = jiraCallsMatching('/properties/brief-forge.work-report');
  expect(property.method).toBe('PUT');
  expect(property.body).toMatchObject({
    issueKey: 'PAY-142',
    status: 'terminé',
    criteriaCovered: '1, 2',
    commentId: 'comment-1001',
    agentName: 'claude-code',
    userAccountId: 'acc-agent',
  });

  expect(saveAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      issueKey: 'PAY-142',
      status: 'terminé',
      userAccountId: 'acc-agent',
      testsPassed: '',
    })
  );
  expect(logAccess).toHaveBeenCalledWith(
    'PAY-142',
    'post-work-report',
    'acc-agent',
    expect.any(String)
  );
});

test('n’affiche aucun avertissement quand des tests sont rapportés', async () => {
  const result = await postWorkReport(
    { ...PAYLOAD, testsPassed: 'npm test — 42/42 verts' },
    AGENT_CONTEXT
  );

  expect(result.ok).toBe(true);
  expect(result.warning).toBeUndefined();

  const posted = JSON.stringify(jiraCallsMatching('/comment')[0].body);
  expect(posted).toContain('Tests lancés et résultat : npm test — 42/42 verts');
  expect(posted).not.toContain('non vérifié par des tests');
});

test('signale un brief périmé sans bloquer l’écriture', async () => {
  hasStaleBrief.mockResolvedValue(true);

  const result = await postWorkReport(PAYLOAD, AGENT_CONTEXT);

  expect(result.ok).toBe(true);
  expect(result.briefWasStale).toBe(true);
});

test('refuse un statut invalide avant toute écriture', async () => {
  const result = await postWorkReport({ ...PAYLOAD, status: 'fini' }, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  expect(result.error).toContain('Statut invalide');
  expect(jiraCalls()).toHaveLength(0);
  expect(saveAttempt).not.toHaveBeenCalled();
});

test('refuse explicitement quand le compte ne peut pas écrire dans le ticket', async () => {
  denyPermission('EDIT_ISSUES');

  const result = await postWorkReport(PAYLOAD, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'WRITE_FORBIDDEN' });
  expect(result.error).toContain('EDIT_ISSUES');
  expect(jiraCallsMatching('/comment')).toHaveLength(0);
  expect(jiraCallsMatching('/properties')).toHaveLength(0);
  expect(saveAttempt).not.toHaveBeenCalled();
});
