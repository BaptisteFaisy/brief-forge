/** Tests de `ask-clarification` : mention, étiquette, refus d'écriture. */

jest.mock('@forge/api', () => require('./jiraApiStub').buildForgeApiMock());
jest.mock('../../../src/storage', () => require('./storageStub').buildStorageMock());

import { askClarification } from '../../../src/actions/askClarification';
import { CLARIFICATION_LABEL } from '../../../src/actions/writeHelpers';
import * as storage from '../../../src/storage';
import {
  STUB_REPORTER,
  denyPermission,
  jiraCalls,
  jiraCallsMatching,
  resetJiraStub,
} from './jiraApiStub';
import { AGENT_CONTEXT, mockOf } from './storageStub';

const FAKE_GH_TOKEN = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');

const logAccess = mockOf(storage.logAccess);

beforeEach(() => {
  resetJiraStub();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('publie un commentaire qui mentionne l’auteur et pose l’étiquette', async () => {
  const result = await askClarification(
    { issueKey: 'PAY-142', question: 'Le remboursement partiel est-il dans le périmètre ?' },
    AGENT_CONTEXT
  );

  expect(result.ok).toBe(true);
  expect(result.issueKey).toBe('PAY-142');
  expect(result.commentUrl).toContain('focusedCommentId=comment-1001');

  const [comment] = jiraCallsMatching('/comment');
  expect(comment.method).toBe('POST');
  const doc = (comment.body as { body: { content: Array<{ content?: unknown[] }> } }).body;
  expect(doc.content[0].content?.[0]).toMatchObject({
    type: 'mention',
    attrs: { id: STUB_REPORTER.accountId, text: `@${STUB_REPORTER.displayName}` },
  });
  expect(JSON.stringify(doc)).toContain('Le remboursement partiel est-il dans le périmètre ?');

  const labelWrites = jiraCalls().filter((call) => call.method === 'PUT');
  expect(labelWrites).toHaveLength(1);
  expect((labelWrites[0].body as { fields: { labels: string[] } }).fields.labels).toEqual([
    'existant',
    CLARIFICATION_LABEL,
  ]);

  expect(logAccess).toHaveBeenCalledWith(
    'PAY-142',
    'ask-clarification',
    'acc-agent',
    expect.any(String)
  );
});

test('refuse explicitement quand le compte ne peut pas commenter, sans rien écrire', async () => {
  denyPermission('ADD_COMMENTS');

  const result = await askClarification(
    { issueKey: 'PAY-142', question: 'Précision ?' },
    AGENT_CONTEXT
  );

  expect(result).toMatchObject({ ok: false, code: 'WRITE_FORBIDDEN' });
  expect(result.error).toContain('Écriture refusée');
  expect(result.error).toContain('ADD_COMMENTS');
  expect(jiraCallsMatching('/comment')).toHaveLength(0);
  expect(jiraCalls().some((call) => call.method !== 'GET')).toBe(false);
  expect(logAccess).not.toHaveBeenCalled();
});

test('refuse un appel sans identité dans le contexte', async () => {
  const result = await askClarification({ issueKey: 'PAY-142', question: 'Précision ?' }, {});

  expect(result).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
  expect(jiraCalls()).toHaveLength(0);
});

test('refuse une question vide et n’écrit rien', async () => {
  const result = await askClarification({ issueKey: 'PAY-142', question: '   ' }, AGENT_CONTEXT);

  expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  expect(result.error).toContain('question');
  expect(jiraCalls()).toHaveLength(0);
});

test('masque un secret avant qu’il n’entre dans le ticket', async () => {
  await askClarification(
    { issueKey: 'PAY-142', question: 'Le jeton ' + FAKE_GH_TOKEN + ' est-il encore valide ?' },
    AGENT_CONTEXT
  );

  const [comment] = jiraCallsMatching('/comment');
  const posted = JSON.stringify(comment.body);
  expect(posted).not.toContain(FAKE_GH_TOKEN);
  expect(posted).toContain('[SECRET:');
});
