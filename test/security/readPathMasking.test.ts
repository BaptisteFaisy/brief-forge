/**
 * BC-11 sur le **chemin de lecture** : un secret collé dans un ticket, un
 * commentaire, une page liée, un compte rendu ou une leçon doit arriver masqué
 * dans le brief renvoyé à l'agent de code.
 *
 * C'est le défaut corrigé ici : la collecte passait par `sanitizeTicketContent`
 * (8 motifs), alors que le masqueur complet (`maskSecrets`, 21 motifs) n'était
 * branché que sur l'écriture. Un JWT ou une clé privée PEM traversaient donc le
 * brief en clair. Ces tests verrouillent les deux garanties :
 *
 * 1. lecture et écriture appliquent **le même** jeu de motifs (une seule source) ;
 * 2. le masquage est idempotent et **garde le type** du secret (`[SECRET:JWT]`),
 *    ce qui permet l'audit.
 *
 * Aucun secret réel : chaque valeur sensible est fausse et construite à
 * l'exécution (`['ghp', '…'].join('_')`), comme dans les fixtures d'intégration.
 */

import { buildBrief } from '../../src/brief';
import type { BriefDeps } from '../../src/brief/builder';
import { parseComments, parseIssueSnapshot } from '../../src/collect/jiraClient';
import type { DecisionRecord, IssueSnapshot, NeighborChange, ProjectSettings } from '../../src/collect/types';
import { redactSecrets, sanitizeTicketContent } from '../../src/security';
import { maskSecrets } from '../../src/security/secretMasker';
import type { AttemptRecord, LessonRecord } from '../../src/storage/types';

/* ------------------------------------------------------------------ *
 * Faux secrets, construits à l'exécution                              *
 * ------------------------------------------------------------------ */

const FAKE_FORGE_TOKEN = ['ghp', '0123456789abcdef0123456789abcdef0123'].join('_');
const FAKE_PROVIDER_KEY = ['sk', 'abcdef0123456789abcdef0123456789'].join('-');
const FAKE_JWT = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  'dozjgNryP4J3jVmNHl0w5N',
].join('.');
const FAKE_PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEowIBAAKCAQEA0valeurfausse',
  '-----END RSA PRIVATE KEY-----',
].join('\n');
const FAKE_CONNECTION = 'postgres://admin:motdepassefictif@db.exemple.local:5432/app';
const FAKE_PASSWORD_LINE = ['password', 'MotDePasseFictif2027'].join('=');
const FAKE_BEARER = 'Authorization: Bearer abcdef0123456789abcdef';

/** Un cas de secret : le texte tiers, ce qui ne doit plus sortir, le marqueur attendu. */
interface SecretCase {
  label: string;
  text: string;
  /** Fragment du secret qui ne doit jamais apparaître après masquage. */
  leaked: string;
  /** Marqueur typé attendu (audit). */
  marker: string;
}

const SECRET_CASES: SecretCase[] = [
  {
    label: 'JWT',
    text: `Authorization: ${FAKE_JWT}`,
    leaked: 'eyJhbGciOiJIUzI1NiJ9',
    marker: '[SECRET:JWT]',
  },
  {
    label: 'clé privée PEM',
    text: FAKE_PEM,
    leaked: 'MIIEowIBAAKCAQEA0valeurfausse',
    marker: '[SECRET:PRIVATE_KEY]',
  },
  {
    label: 'chaîne de connexion',
    text: `Accès de test : ${FAKE_CONNECTION}`,
    leaked: 'motdepassefictif',
    marker: '[SECRET:CONNECTION_STRING]',
  },
  {
    label: 'affectation password=',
    text: FAKE_PASSWORD_LINE,
    leaked: 'MotDePasseFictif2027',
    marker: '[SECRET:REDACTED]',
  },
  {
    label: 'jeton de forge',
    text: `token = ${FAKE_FORGE_TOKEN}`,
    leaked: '0123456789abcdef0123456789abcdef0123',
    marker: '[SECRET:GH_PAT]',
  },
  {
    label: 'clé de fournisseur',
    text: `clé d'api = ${FAKE_PROVIDER_KEY}`,
    leaked: 'abcdef0123456789abcdef0123456789',
    marker: '[SECRET:OPENAI_KEY]',
  },
  {
    label: 'jeton porteur',
    text: FAKE_BEARER,
    leaked: 'abcdef0123456789abcdef',
    marker: '[SECRET:TOKEN]',
  },
];

/** Tous les secrets d'un coup, comme dans un commentaire de debug réel. */
const EVERY_SECRET = SECRET_CASES.map((item) => item.text).join('\n');
const EVERY_LEAK = SECRET_CASES.map((item) => item.leaked);

/* ------------------------------------------------------------------ *
 * Doublures : charge Jira brute et dépendances du brief               *
 * ------------------------------------------------------------------ */

const DATE = '2027-02-10T09:00:00.000Z';

/** Charge Jira REST v2 minimale, avec un commentaire portant `body`. */
function rawIssue(description: string, commentBody: string): Record<string, unknown> {
  return {
    key: 'PAY-77',
    fields: {
      summary: 'Nettoyer la journalisation des erreurs de paiement',
      description,
      status: { name: 'En cours' },
      issuetype: { name: 'Story' },
      project: { key: 'PAY' },
      reporter: { displayName: 'samir' },
      assignee: { displayName: 'luc' },
      created: DATE,
      updated: DATE,
      labels: ['backend'],
      components: [{ name: 'paiements' }],
      comment: {
        comments: [
          {
            id: 'c1',
            author: { displayName: 'mallory' },
            created: DATE,
            body: commentBody,
          },
        ],
      },
    },
  };
}

function makeSettings(): ProjectSettings {
  return {
    projectId: 'p-pay',
    projectKey: 'PAY',
    triggerStatus: 'À faire',
    decisionLabels: ['décision'],
    constraintsText: 'Pas de migration destructive.',
    componentZone: 'src/payments',
  };
}

function makeAttempt(reportMd: string): AttemptRecord {
  return {
    id: 'a1',
    issueKey: 'PAY-77',
    agentName: 'agent-prec',
    userAccountId: 'u-1',
    startedAt: DATE,
    status: 'abandonné',
    reportMd,
    criteriaCovered: 'aucun',
    testsPassed: 'non',
  };
}

function makeLesson(text: string): LessonRecord {
  return {
    id: 'l1',
    projectKey: 'PAY',
    component: 'paiements',
    text,
    sourceAttemptId: 'a1',
    createdAt: DATE,
  };
}

function makeDecision(body: string): DecisionRecord {
  return {
    title: 'ADR-030 — Journalisation des paiements',
    url: 'https://exemple.atlassian.net/wiki/pages/30',
    date: DATE,
    author: 'dana',
    body,
  };
}

function makeNeighbor(title: string): NeighborChange {
  return {
    kind: 'pull-request',
    title,
    url: 'https://exemple.atlassian.net/dev/changes/12',
    date: DATE,
    author: 'luc',
    state: 'merged',
  };
}

/**
 * Dépendances du brief : un secret différent par source, pour prouver que
 * chaque entrée du chemin de lecture est masquée (budget `l` : rien n'est
 * tronqué, le markdown contient tout).
 */
function briefDeps(issue: IssueSnapshot): BriefDeps {
  return {
    collectIssue: async () => issue,
    readSettings: async () => makeSettings(),
    collectDecisions: async () => [makeDecision(SECRET_CASES[0].text)],
    collectNeighborChanges: async () => [makeNeighbor(SECRET_CASES[2].text)],
    loadAttempts: async () => [makeAttempt(SECRET_CASES[3].text)],
    loadLessons: async () => [makeLesson(SECRET_CASES[1].text)],
  };
}

/* ------------------------------------------------------------------ *
 * 1. Le chemin de lecture masque tout, et comme l'écriture            *
 * ------------------------------------------------------------------ */

describe('BC-11 — chemin de lecture : collecte', () => {
  it.each(SECRET_CASES)('masque $label dans un commentaire collecté', (secret) => {
    const [comment] = parseComments([
      { id: 'c1', author: { displayName: 'mallory' }, created: DATE, body: secret.text },
    ]);
    expect(comment.body).not.toContain(secret.leaked);
    expect(comment.body).toContain(secret.marker);
  });

  it('masque tous les secrets d’un commentaire en un seul passage', () => {
    const [comment] = parseComments([
      { id: 'c1', author: { displayName: 'mallory' }, created: DATE, body: EVERY_SECRET },
    ]);
    for (const leaked of EVERY_LEAK) expect(comment.body).not.toContain(leaked);
    for (const secret of SECRET_CASES) expect(comment.body).toContain(secret.marker);
  });

  it('masque la description et les commentaires du ticket', () => {
    const snapshot = parseIssueSnapshot(
      rawIssue(
        `Un collaborateur a collé ${FAKE_PROVIDER_KEY} et ${FAKE_PASSWORD_LINE}.`,
        EVERY_SECRET
      )
    );
    expect(snapshot.description).not.toContain('abcdef0123456789abcdef0123456789');
    expect(snapshot.description).toContain('[SECRET:REDACTED]');
    expect(snapshot.comments[0].body).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(snapshot.comments[0].body).toContain('[SECRET:JWT]');
  });
});

describe('BC-11 — chemin de lecture : brief complet', () => {
  it('ne laisse aucun secret dans le markdown renvoyé à l’agent', async () => {
    const issue = parseIssueSnapshot(rawIssue(`Diagnostic : ${EVERY_SECRET}`, EVERY_SECRET));
    const brief = await buildBrief('PAY-77', 'l', briefDeps(issue));

    for (const leaked of EVERY_LEAK) expect(brief.markdown).not.toContain(leaked);
    for (const secret of SECRET_CASES) expect(brief.markdown).toContain(secret.marker);
  });

  it('masque aussi les champs structurés du brief', async () => {
    const issue = parseIssueSnapshot(rawIssue(`Diagnostic : ${FAKE_CONNECTION}`, EVERY_SECRET));
    const brief = await buildBrief('PAY-77', 'l', briefDeps(issue));
    const serialized = JSON.stringify({
      objective: brief.objective,
      decisions: brief.applicableDecisions,
      attempts: brief.failedAttempts,
      neighbors: brief.neighborChanges,
      lessons: brief.lessons,
    });

    for (const leaked of EVERY_LEAK) expect(serialized).not.toContain(leaked);
    expect(serialized).toContain('[SECRET:CONNECTION_STRING]');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Une seule source de motifs : lecture == écriture                 *
 * ------------------------------------------------------------------ */

describe('BC-11 — jeu de motifs unique', () => {
  it.each(SECRET_CASES)('$label : lecture et écriture donnent le même résultat', (secret) => {
    expect(sanitizeTicketContent(secret.text, 'mallory', DATE)).toBe(maskSecrets(secret.text));
    expect(redactSecrets(secret.text)).toBe(maskSecrets(secret.text));
  });

  it('applique les motifs complémentaires sur le chemin de lecture', () => {
    // Ces formats n'étaient masqués que sur l'écriture avant la correction.
    expect(sanitizeTicketContent(FAKE_JWT)).toContain('[SECRET:JWT]');
    expect(sanitizeTicketContent(FAKE_PEM)).toBe('[SECRET:PRIVATE_KEY]');
    expect(sanitizeTicketContent('glpat-abcdefghij0123456789')).toContain('[SECRET:GITLAB_PAT]');
    expect(sanitizeTicketContent('mot de passe = Tr0pSecret')).toContain('[SECRET:REDACTED]');
  });
});

/* ------------------------------------------------------------------ *
 * 3. Idempotence et survie du type                                    *
 * ------------------------------------------------------------------ */

describe('BC-11 — idempotence et type du secret', () => {
  it.each(SECRET_CASES)('$label : masquer deux fois ne change rien', (secret) => {
    const once = sanitizeTicketContent(secret.text, 'mallory', DATE);
    expect(sanitizeTicketContent(once, 'mallory', DATE)).toBe(once);
    expect(maskSecrets(once)).toBe(once);
  });

  it('garde le type d’un marqueur déjà posé', () => {
    expect(maskSecrets('[SECRET:GH_PAT]')).toBe('[SECRET:GH_PAT]');
    expect(maskSecrets('token = [SECRET:GH_PAT]')).toContain('[SECRET:GH_PAT]');
    expect(sanitizeTicketContent('clé : [SECRET:JWT] et [SECRET:PRIVATE_KEY]')).toBe(
      'clé : [SECRET:JWT] et [SECRET:PRIVATE_KEY]'
    );
  });

  it('ne dégrade pas un marqueur en marqueur générique', () => {
    const twice = maskSecrets(maskSecrets(`password = ${FAKE_PASSWORD_LINE}`));
    expect(twice).toBe('password: [SECRET:REDACTED]');
    expect(twice).not.toContain('[SECRET: [SECRET:REDACTED]');
  });

  it('préserve le type quand un format connu suit un libellé générique', () => {
    expect(maskSecrets(`token = ${FAKE_FORGE_TOKEN}`)).toContain('[SECRET:GH_PAT]');
    expect(maskSecrets(`jeton = ${FAKE_JWT}`)).toContain('[SECRET:JWT]');
  });
});
