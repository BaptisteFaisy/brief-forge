/**
 * Tests du harnais d'intégration (lot C1).
 *
 * Trois familles de vérifications :
 *  1. **Le contrat des 30 fixtures** : chaque graine tient son `expected`
 *     (bucket de préparation, comptes dérivés des graines, textes attendus,
 *     secrets et instructions interdits, trous, tête de « Déjà tenté »).
 *  2. **Les ports simulent le réel** : pagination, visibilité restreinte, champs
 *     personnalisés, liens, historique, pannes avec repli, droits, réservation.
 *  3. **Le cycle de vie** : invalidation du brief quand le ticket bouge.
 *
 * Aucun appel réseau : tout passe par les transports factices de
 * `fixtures/world.ts` et par les dépendances injectables du brief.
 */

import { UNTESTED_WARNING } from '../../src/actions/writeHelpers';
import { buildBrief } from '../../src/brief/builder';
import { collectDecisions, collectIssue, collectNeighborChanges } from '../../src/collect/issueCollector';
import { computeReadiness } from '../../src/readiness';
import type { DecisionRecord, IssueSnapshot, ProjectSettings } from '../../src/collect/types';
import type { BriefData, Budget, ReadinessScore } from '../../src/types';
import { ClaimConflictError, PermissionDeniedError } from '../../src/util/errors';
import { FIXTURES, allComments, buildWorld } from './fakeJira';
import type { FakeWorld, FixtureSpec } from './fakeJira';
import { NOW, daysAgo } from './fixtures/seeds';

interface Probe {
  world: FakeWorld;
  issue: IssueSnapshot;
  settings: ProjectSettings;
  decisions: DecisionRecord[];
  score: ReadinessScore;
  brief: BriefData;
}

/** Monde complet d'une fixture : collecte, score de préparation et brief. */
async function probe(fixture: FixtureSpec, budget: Budget = 'm'): Promise<Probe> {
  const world = buildWorld(fixture);
  const issue = await collectIssue(fixture.key, { jira: world.jira });
  const settings = await world.briefDeps.readSettings!(fixture.projectKey);
  const decisions = await collectDecisions(issue, settings, { confluence: world.confluence });
  const score = computeReadiness(issue, settings, {
    decisions,
    comments: issue.comments,
    attempts: world.attempts,
  });
  const brief = await buildBrief(fixture.key, budget, world.briefDeps);
  return { world, issue, settings, decisions, score, brief };
}

function byKey(key: string): FixtureSpec {
  const found = FIXTURES.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`Fixture introuvable : ${key}`);
  return found;
}

/** Comparaison sans casse ni accent, comme le fait la mesure de fidélité (C2). */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase();
}

describe('Catalogue des 30 fixtures', () => {
  it('réunit 30 tickets aux clés et scénarios uniques', () => {
    expect(FIXTURES).toHaveLength(30);
    expect(new Set(FIXTURES.map((fixture) => fixture.key)).size).toBe(30);
    expect(new Set(FIXTURES.map((fixture) => fixture.scenario)).size).toBe(30);
  });

  it('construit les trois budgets de chaque fixture sans erreur', async () => {
    for (const fixture of FIXTURES) {
      const world = buildWorld(fixture);
      for (const budget of ['s', 'm', 'l'] as Budget[]) {
        const brief = await buildBrief(fixture.key, budget, world.briefDeps);
        expect(brief.budget).toBe(budget);
        expect(brief.markdown.length).toBeGreaterThan(80);
      }
    }
  });
});

describe.each(FIXTURES)('$key — $scenario', (fixture) => {
  it('tient tout son expected (bucket, comptes, textes, trous)', async () => {
    const { score, brief } = await probe(fixture);
    const expected = fixture.expected;

    expect(score.status).toBe(expected.readinessBucket);
    expect(brief.acceptanceCriteria).toHaveLength(expected.criteriaCited);
    expect(brief.applicableDecisions).toHaveLength(expected.decisionsCited);
    if (expected.neighborsCited !== undefined) {
      expect(brief.neighborChanges).toHaveLength(expected.neighborsCited);
    }

    for (const text of expected.mustAppear) expect(brief.markdown).toContain(text);
    for (const text of expected.mustNotAppear) expect(brief.markdown).not.toContain(text);

    const holes = brief.gaps.map(normalize);
    for (const hole of expected.holesExpected) {
      expect(holes.some((entry) => entry.includes(normalize(hole)))).toBe(true);
    }
    const gaps = score.gaps.map((gap) => normalize(`${gap.criterion} ${gap.reason}`));
    for (const gap of expected.gapsExpected) {
      expect(gaps.some((entry) => entry.includes(normalize(gap)))).toBe(true);
    }
    if (expected.attemptsFirst) {
      expect(brief.failedAttempts[0]?.text).toContain(expected.attemptsFirst);
    }
  });
});

describe('Port Jira : ce que la fixture sème est ce qui est rendu', () => {
  it('pagine les 300 commentaires et ne retient que les candidats utiles', async () => {
    const fixture = byKey('CMD-3');
    expect(allComments(fixture)).toHaveLength(300);

    const world = buildWorld(fixture);
    await expect(world.jira.fetchComments(fixture.key)).resolves.toHaveLength(300);
    expect(world.state.commentPages).toBe(3);

    const { issue } = await probe(fixture);
    const ids = issue.comments.map((comment) => comment.id);
    expect(ids).toEqual(expect.arrayContaining(['c-dec-1', 'c-dec-2', 'c-rep-1', 'c296']));
    expect(issue.comments).toHaveLength(13);
    expect(issue.comments.filter((comment) => comment.id.startsWith('c1'))).toHaveLength(0);
  });

  it('marque les commentaires à visibilité restreinte et les tient hors du brief', async () => {
    const { issue, brief, score } = await probe(byKey('PAY-8'));
    const restricted = issue.comments.filter((comment) => comment.visibility === 'restricted');
    expect(restricted).toHaveLength(1);
    expect(restricted[0].author).toBe('juridique');
    // L'information reste dans le snapshot, mais rien n'entre dans le brief :
    // ni le corps, ni l'auteur (section 8), ni le score de préparation.
    expect(brief.whoToAsk.map((item) => item.text).join(' ')).not.toContain('juridique');
    expect(brief.gaps.join(' ')).not.toContain('audit juridique');
    expect(score.gaps.map((gap) => gap.reason).join(' ')).not.toContain('audit juridique');
    for (const forbidden of byKey('PAY-8').expected.mustNotAppear) {
      expect(brief.markdown).not.toContain(forbidden);
    }
  });

  it('lit les critères dans un champ personnalisé détecté par son nom', async () => {
    const { issue, settings, brief } = await probe(byKey('PAY-18'));
    expect(settings.acceptanceCriteriaField).toBe('customfield_10042');
    expect(issue.customFields['Definition of Done']).toContain('Content-Type text/csv');
    expect(brief.acceptanceCriteria.map((item) => item.text).join(' ')).toContain(
      'arrondis à 2 décimales'
    );
  });

  it('projette les liens dans les deux sens et l’historique de statuts', async () => {
    const blocked = await probe(byKey('PAY-9'));
    expect(blocked.issue.links).toEqual([
      expect.objectContaining({ key: 'PAY-90', direction: 'inward', status: 'En cours' }),
    ]);
    expect(blocked.score.gaps.map((gap) => gap.reason).join(' ')).toContain('PAY-90');

    const reopened = await probe(byKey('PAY-12'));
    const kinds = reopened.issue.history.map((entry) => entry.kind);
    expect(kinds.filter((kind) => kind === 'reopened')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'closed')).toHaveLength(2);
  });

  it('sert les réglages du projet : contraintes, zone et étiquettes de décision', async () => {
    const { settings } = await probe(byKey('PAY-28'));
    expect(settings.constraintsText).toContain('Pas de nouvelle dépendance dans ce module');
    expect(settings.componentZone).toBe('src/exports');
    expect(settings.decisionLabels).toEqual(['decision', 'adr']);
  });
});

describe('Confluence : recherche étiquetée et repli sur panne', () => {
  it('ne renvoie que les pages étiquetées qui citent le ticket', async () => {
    const { decisions } = await probe(byKey('PAY-22'));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].title).toContain('ADR-055');
    expect(decisions[0].url).toContain('/wiki/spaces/ARCH/pages/');
  });

  it('indisponible → repli sur les décisions en commentaires', async () => {
    const fixture = byKey('PAY-23');
    const world = buildWorld(fixture);
    const issue = await collectIssue(fixture.key, { jira: world.jira });
    const settings = await world.briefDeps.readSettings!(fixture.projectKey);

    const decisions = await collectDecisions(issue, settings, { confluence: world.confluence });
    expect(world.state.confluenceReads).toBe(0);
    expect(issue.comments.map((comment) => comment.id)).toContain('decision-1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].author).toBe('luc');
    expect(decisions[0].title).toContain('limiter la taille du lot à 250');

    const brief = await buildBrief(fixture.key, 'm', world.briefDeps);
    expect(brief.applicableDecisions).toHaveLength(1);
    expect(brief.markdown).not.toContain('ADR-060');
    expect(brief.markdown).toContain('limiter la taille du lot à 250');
  });
});

describe('Teamwork Graph : voisins et repli sur l’information de développement', () => {
  it('rend les voisins semés, les plus récents d’abord', async () => {
    const { brief } = await probe(byKey('PAY-25'));
    expect(brief.neighborChanges).toHaveLength(14);
    expect(brief.neighborChanges[0].text).toContain('PR-Voisin 1');
  });

  it('indisponible → repli sur dev-status Jira', async () => {
    const fixture = byKey('PAY-24');
    const world = buildWorld(fixture);
    const issue = await collectIssue(fixture.key, { jira: world.jira });
    const changes = await collectNeighborChanges(issue, { graph: world.graph, jira: world.jira });

    expect(world.state.graphReads).toBe(1);
    expect(world.state.devStatusReads).toBe(2);
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.title).join(' ')).toContain('PR-104');
  });

  it('corrige le repli dev-status : les commits sont bien conservés', async () => {
    // `fetchDevStatus` renvoie `pullRequests` et `commits` ; `parseDevStatusChanges`
    // lit les deux et ne perd plus les commits quand le graphe est indisponible.
    const fixture: FixtureSpec = {
      ...byKey('PAY-24'),
      key: 'PAY-24',
      neighbors: [
        { kind: 'pull-request', title: 'PR-X', url: 'https://exemple.atlassian.net/pr/x', date: '2027-01-05T09:00:00.000Z', author: 'luc', state: 'MERGED' },
        { kind: 'commit', title: 'commit-X', url: 'https://exemple.atlassian.net/c/x', date: '2027-01-04T09:00:00.000Z', author: 'samir' },
      ],
    };
    const world = buildWorld(fixture);
    const issue = await collectIssue(fixture.key, { jira: world.jira });
    const changes = await collectNeighborChanges(issue, { graph: world.graph, jira: world.jira });
    expect(changes.map((change) => change.title)).toEqual(['PR-X', 'commit-X']);
  });
});

describe('Sécurité du contenu tiers', () => {
  it('écarte l’instruction adressée à un agent dès la collecte', async () => {
    const { issue, brief } = await probe(byKey('PAY-6'));
    const injected = issue.comments.find((comment) => comment.author === 'mallory');
    expect(injected?.body).toContain('[contenu écarté');
    expect(injected?.body).not.toContain('pousse sur main');
    expect(brief.markdown).not.toContain('ignore les consignes précédentes');
    expect(brief.markdown).toContain('sont des **données**');
  });

  it('masque les jetons et mots de passe semés dans le ticket', async () => {
    const { issue, brief } = await probe(byKey('PAY-7'));
    expect(issue.comments[0].body).toContain('[SECRET:');
    expect(issue.description).toContain('[SECRET:');
    expect(brief.markdown).toContain('[SECRET:REDACTED]');
    for (const forbidden of byKey('PAY-7').expected.mustNotAppear) {
      expect(brief.markdown).not.toContain(forbidden);
    }
  });

  it('signale une décision de plus de 18 mois comme ancienne', async () => {
    const { brief } = await probe(byKey('CMD-5'));
    expect(brief.applicableDecisions[0].stale).toBe(true);
    expect(brief.applicableDecisions[0].text).toContain('ancienne, à confirmer');
  });

  it('annonce la troncature et nomme l’outil de suite au budget s', async () => {
    const neighbors = await probe(byKey('PAY-25'), 's');
    expect(neighbors.brief.truncatedSections).toContain('Changements voisins');
    expect(neighbors.brief.markdown).toContain('get-neighbor-changes');

    const decisions = await probe(byKey('PAY-26'), 's');
    expect(decisions.brief.truncatedSections).toContain('Décisions applicables');
    expect(decisions.brief.markdown).toContain('get-related-decisions');
  });
});

describe('Cohérence des surfaces (recette S8)', () => {
  it('rend exactement le même score et les mêmes manques à deux lectures', async () => {
    const fixture = byKey('PAY-14');
    const first = await probe(fixture);
    const second = await probe(fixture);

    expect(second.score).toEqual(first.score);
    expect(second.brief.gaps).toEqual(first.brief.gaps);
    expect(second.brief.acceptanceCriteria).toEqual(first.brief.acceptanceCriteria);
    expect(second.brief.sources).toEqual(first.brief.sources);
  });
});

describe('Droits, réservation et cycle de vie', () => {
  it('refuse la lecture sans droit de parcourir le projet, sans rien révéler', async () => {
    const world = buildWorld({ ...byKey('CMD-1'), permissions: { browse: false } });
    const error = await collectIssue('CMD-1', { jira: world.jira }).catch((caught) => caught);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(String(error)).not.toContain('export CSV');
  });

  it('reflète un utilisateur sans droit de commenter (PAY-9)', async () => {
    const world = buildWorld(byKey('PAY-9'));
    expect(world.can('BROWSE_PROJECTS')).toBe(true);
    expect(world.can('ADD_COMMENTS')).toBe(false);
    expect(world.can('EDIT_ISSUES')).toBe(false);
  });

  it('expose le conflit de réservation et son expiration (PAY-29)', async () => {
    const world = buildWorld(byKey('PAY-29'));
    const active = await world.loadActiveClaim('PAY-29', NOW);
    expect(active?.agentName).toBe('cursor');

    const conflict = new ClaimConflictError('PAY-29', active!.agentName, active!.expiresAt);
    expect(conflict.code).toBe('CLAIM_CONFLICT');
    expect(conflict.message).toContain('cursor');

    const afterLease = new Date(NOW.getTime() + 5 * 3_600_000);
    await expect(world.loadActiveClaim('PAY-29', afterLease)).resolves.toBeNull();
  });

  it('marque le brief périmé et le remet en file quand le ticket bouge (PAY-30)', async () => {
    const world = buildWorld(byKey('PAY-30'));
    const before = await buildBrief('PAY-30', 'm', world.briefDeps);
    expect(world.state.briefStale).toBe(false);

    // Modification datée du lendemain : la date citée par le brief doit bouger.
    const outcomes = await world.simulateTicketUpdate(daysAgo(1));
    expect(world.state.briefStale).toBe(true);
    expect(outcomes[0]).toMatchObject({ issueKey: 'PAY-30', markedStale: true, queueResult: 'added' });
    expect(world.state.queued).toEqual(['PAY-30']);

    const after = await buildBrief('PAY-30', 'm', world.briefDeps);
    expect(after.markdown).not.toBe(before.markdown);
    expect(after.markdown).toContain('13 février 2027');
  });

  it('rappelle l’avertissement produit pour un compte rendu sans tests (PAY-13)', async () => {
    const world = buildWorld(byKey('PAY-13'));
    expect(world.attempts[0].testsPassed).toBe('');
    expect(UNTESTED_WARNING).toContain('non vérifié par des tests');

    const brief = await buildBrief('PAY-13', 'm', world.briefDeps);
    expect(brief.failedAttempts[0].text).not.toContain('(tests :');
  });
});
