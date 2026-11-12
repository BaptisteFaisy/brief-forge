/**
 * Tests hors ligne du kit de démonstration (`demo/seed.json` +
 * `scripts/demo-seed.mjs`).
 *
 * Trois niveaux, tous sans réseau :
 *  1. le jeu de données contient bien ce que la vidéo exige ;
 *  2. le générateur produit les requêtes attendues, en dry-run, sans jamais
 *     imprimer d'identifiant ;
 *  3. **le jeu est vérifié contre le code du produit** : le commentaire de
 *     décision est reconnu comme tel, le commentaire piégé est détecté, le faux
 *     secret est masqué, et le score de préparation annoncé par
 *     `docs/DEMO-KIT.md` est bien celui que calcule `computeReadiness`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeReadiness } from '../../src/readiness';
import { checkContradictoryDecision } from '../../src/readiness/criteria/contradictoryDecisionCheck';
import { isDecisionComment } from '../../src/collect/issueCollector';
import { detectInjection } from '../../src/security/injectionRules';
import { maskSecrets } from '../../src/security/secretMasker';
import { makeComment, makeDecision, makeIssue, makeSettings } from '../readiness/fixtures';
import type { DecisionRecord, IssueComment, IssueSnapshot } from '../../src/readiness/types';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join('scripts', 'demo-seed.mjs');
const LIB = join('scripts', 'lib', 'seedRequests.mjs');
const SEED_PATH = join('demo', 'seed.json');

interface Seed {
  meta: {
    site: string;
    projectKey: string;
    component: string;
    labels: { initial: string[]; clarification: string; decisions: string[] };
    limits: string[];
    mcpCalls: Array<{ tool: string; arguments: Record<string, string> }>;
  };
  issue: { summary: string; descriptionLines: string[] };
  decisions: {
    confluencePage: { title: string; labels: string[]; bodyLines: string[] };
    comment: { body: string };
  };
  neighbors: Array<{ summary: string; descriptionLines: string[] }>;
  question: { body: string };
  contacts: Array<{ name: string; role: string }>;
  hole: { text: string };
  onCamera: {
    criteria: { heading: string; items: string[] };
    answer: { body: string };
    component: string;
    poisonedComment: { body: string };
  };
  fakeSecret: { prefix: string; body: string; password: string; commentTemplate: string };
  expected: Record<string, { score: number; status: string }>;
  reset: { commentMarker: string; attemptCommentMarker: string; reportPropertyKey: string };
}

const seed = JSON.parse(readFileSync(join(ROOT, SEED_PATH), 'utf-8')) as Seed;

/** Faux secret assemblé comme le fait le script : jamais de littéral en dépôt. */
function fakeToken(): string {
  return [seed.fakeSecret.prefix, seed.fakeSecret.body].join('_');
}

function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ATLASSIAN_API_EMAIL: '',
      ATLASSIAN_API_TOKEN: '',
      ATLASSIAN_API_EMAIL_2: '',
      ATLASSIAN_API_TOKEN_2: '',
      DEMO_ISSUE: '',
      ...env,
    },
  });
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function countRequests(out: string): number {
  return (out.match(/^── \d+\. \[/gm) ?? []).length;
}

/** Ticket de la démo dans l'état « initial » (0:00 dans la vidéo). */
function seededIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return makeIssue({
    issueKey: 'PAY-123',
    projectKey: seed.meta.projectKey,
    summary: seed.issue.summary,
    description: seed.issue.descriptionLines.join('\n'),
    status: 'À faire',
    issueType: 'Story',
    components: [],
    labels: [...seed.meta.labels.initial],
    reporter: seed.contacts[0].name,
    assignee: seed.contacts[1].name,
    acceptanceCriteria: [],
    links: [],
    comments: [],
    ...overrides,
  });
}

function seededComments(): IssueComment[] {
  return [
    makeComment({ id: 'c1', author: seed.contacts[0].name, body: seed.decisions.comment.body }),
    makeComment({ id: 'c2', author: seed.contacts[1].name, body: seed.question.body }),
  ];
}

function seededDecisions(): DecisionRecord[] {
  const pageText = seed.decisions.confluencePage.bodyLines.join('\n').replace(/<[^>]+>/g, ' ');
  return [
    makeDecision({ title: seed.decisions.confluencePage.title, body: pageText, author: 'claire.martin' }),
    makeDecision({ title: 'Commentaire Jira', body: seed.decisions.comment.body, author: seed.contacts[0].name }),
  ];
}

describe('demo/seed.json — le jeu exigé par la vidéo', () => {
  test('quatre critères d\'acceptation vérifiables', () => {
    expect(seed.onCamera.criteria.items).toHaveLength(4);
    for (const item of seed.onCamera.criteria.items) expect(item.length).toBeGreaterThan(30);
  });

  test('deux décisions applicables : une page Confluence étiquetée et un commentaire marqué', () => {
    expect(seed.decisions.confluencePage.labels).toContain('decision');
    expect(seed.decisions.confluencePage.bodyLines.join(' ')).toContain('{{ISSUE_KEY}}');
    expect(isDecisionComment(seed.decisions.comment.body)).toBe(true);
  });

  test('trois changements voisins, un trou, deux personnes à contacter', () => {
    expect(seed.neighbors).toHaveLength(3);
    expect(seed.hole.text).toContain('par carte ou par client');
    expect(seed.contacts).toHaveLength(2);
  });

  test('une tentative passée refusée est prévue via l\'outil MCP (pas en REST)', () => {
    const tools = seed.meta.mcpCalls.map((call) => call.tool);
    expect(tools).toEqual(['record-failed-attempt', 'claim-work', 'post-work-report']);
  });

  test('commentaire piégé et faux secret présents, sans littéral sensible', () => {
    expect(seed.onCamera.poisonedComment.body).toContain('ignore all previous instructions');
    expect(seed.fakeSecret.body).toHaveLength(36);
    expect(seed.fakeSecret.commentTemplate).toContain('{{FAKE_TOKEN}}');
    const raw = readFileSync(join(ROOT, SEED_PATH), 'utf-8');
    expect(raw).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
    expect(raw).not.toMatch(/sk-[A-Za-z0-9_-]{24,}/);
  });
});

describe('scripts/demo-seed.mjs — dry-run', () => {
  test('syntaxe valide et fichiers sous 500 lignes', () => {
    for (const file of [SCRIPT, LIB]) {
      expect(spawnSync('node', ['--check', file], { cwd: ROOT }).status).toBe(0);
      expect(readFileSync(join(ROOT, file), 'utf-8').split('\n').length).toBeLessThan(500);
    }
  });

  test('l\'étape « initial » produit 12 requêtes, dans l\'ordre du seed', () => {
    const { status, out } = run(['--dry-run']);
    expect(status).toBe(0);
    expect(countRequests(out)).toBe(12);
    expect(out).toContain('POST https://one-atlas-cndz.atlassian.net/rest/api/2/issue');
    expect(out).toContain('/wiki/rest/api/content');
    expect(out).toContain('12 requête(s) produite(s), aucune envoyée');
  });

  test('l\'étape « all » enchaîne initial, fixed, poison et secret (16 requêtes)', () => {
    const { status, out } = run(['--stage', 'all', '--issue', 'PAY-123', '--dry-run']);
    expect(status).toBe(0);
    expect(countRequests(out)).toBe(16);
    for (const stage of ['initial', 'fixed', 'poison', 'secret']) expect(out).toContain(`[${stage}]`);
  });

  test('la remise à zéro relit le ticket avant de supprimer', () => {
    const { status, out } = run(['--stage', 'reset', '--issue', 'PAY-123']);
    expect(status).toBe(0);
    expect(out).toContain('fields=labels,comment');
    expect(out).toContain(seed.reset.reportPropertyKey);
    expect(out).toContain('restaurer la description initiale');
    expect(out).not.toContain('ignore all previous instructions');
  });

  test('--with-poison rejoue le commentaire piégé après la remise à zéro', () => {
    const { status, out } = run(['--stage', 'reset', '--issue', 'PAY-123', '--with-poison']);
    expect(status).toBe(0);
    expect(out).toContain('ignore all previous instructions');
    expect(out).toContain('rejoué pour la prise suivante');
  });

  test('hors étape « initial », la clé du ticket est obligatoire', () => {
    const { status } = run(['--stage', 'fixed']);
    expect(status).toBe(1);
  });

  test('--send sans identifiants refuse (code 1)', () => {
    const { status, out } = run(['--send', '--stage', 'poison', '--issue', 'PAY-123']);
    expect(status).toBe(1);
    expect(out).toContain('ATLASSIAN_API_EMAIL');
  });

  test('les identifiants ne sont jamais imprimés, même fournis', () => {
    const { status, out } = run(['--stage', 'all', '--issue', 'PAY-123'], {
      ATLASSIAN_API_EMAIL: 'demo@example.com',
      ATLASSIAN_API_TOKEN: 'SUPER-SECRET-VALUE',
      ATLASSIAN_API_EMAIL_2: 'second@example.com',
      ATLASSIAN_API_TOKEN_2: 'SECOND-SECRET-VALUE',
    });
    expect(status).toBe(0);
    expect(out).not.toContain('SUPER-SECRET-VALUE');
    expect(out).not.toContain('SECOND-SECRET-VALUE');
    expect(out).not.toContain('demo@example.com');
    expect(out).toContain('non affiché');
  });
});

describe('jeu de démo vérifié contre le code du produit', () => {
  test('le commentaire piégé est détecté comme instruction adressée à un agent', () => {
    expect(detectInjection(seed.onCamera.poisonedComment.body).suspicious).toBe(true);
  });

  test('le faux secret assemblé à l\'exécution est bien masqué', () => {
    const masked = maskSecrets(seed.fakeSecret.commentTemplate.replaceAll('{{FAKE_TOKEN}}', fakeToken()));
    expect(masked).toContain('[SECRET:GH_PAT]');
    expect(masked).not.toContain(fakeToken());
    expect(masked).not.toContain(seed.fakeSecret.password);
  });

  test('les deux décisions ne se contredisent pas (10 points conservés)', () => {
    const outcome = checkContradictoryDecision({
      issue: seededIssue(),
      settings: makeSettings({ projectKey: seed.meta.projectKey }),
      decisions: seededDecisions(),
      comments: [],
      attempts: [],
    });
    expect(outcome.passed).toBe(true);
  });

  test('état initial : le score annoncé par la doc est celui du barème réel', () => {
    const comments = seededComments();
    const score = computeReadiness(seededIssue({ comments }), makeSettings({ projectKey: seed.meta.projectKey }), {
      decisions: seededDecisions(),
      comments,
      attempts: [],
    });
    expect(score.score).toBe(seed.expected.initial.score);
    expect(score.status).toBe(seed.expected.initial.status);
    expect(score.gaps.map((gap) => gap.pointsLost)).toEqual([30, 10, 10]);
  });

  test('état corrigé par un second auteur : plus aucun manque', () => {
    const description = [
      ...seed.issue.descriptionLines,
      '',
      seed.onCamera.criteria.heading,
      ...seed.onCamera.criteria.items.map((item) => `* ${item}`),
    ].join('\n');
    const comments = [
      ...seededComments(),
      makeComment({ id: 'c3', author: seed.contacts[0].name, body: seed.onCamera.answer.body }),
    ];
    const score = computeReadiness(
      seededIssue({
        description,
        components: [seed.onCamera.component],
        comments,
      }),
      makeSettings({ projectKey: seed.meta.projectKey }),
      { decisions: seededDecisions(), comments, attempts: [] }
    );
    expect(score.score).toBe(seed.expected.fixedSecondAuthor.score);
    expect(score.gaps).toEqual([]);
  });

  test('répondre à sa propre question ne suffit pas : 10 points restent perdus', () => {
    const sameAuthor = [
      makeComment({ id: 'c2', author: seed.contacts[0].name, body: seed.question.body }),
      makeComment({ id: 'c3', author: seed.contacts[0].name, body: seed.onCamera.answer.body }),
    ];
    const description = [
      ...seed.issue.descriptionLines,
      '',
      seed.onCamera.criteria.heading,
      ...seed.onCamera.criteria.items.map((item) => `* ${item}`),
    ].join('\n');
    const score = computeReadiness(
      seededIssue({ description, components: [seed.onCamera.component], comments: sameAuthor }),
      makeSettings({ projectKey: seed.meta.projectKey }),
      { decisions: seededDecisions(), comments: sameAuthor, attempts: [] }
    );
    expect(score.score).toBe(seed.expected.fixedSameAuthor.score);
    expect(score.gaps).toHaveLength(1);
  });
});
