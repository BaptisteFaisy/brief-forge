/**
 * Export des données de démonstration du site public (`site/`).
 *
 * Ce test est un **générateur** : il rejoue le vrai moteur (collecte simulée →
 * brief → préparation) sur une sélection de fixtures et écrit le résultat dans
 * `site/assets/data/demo.json`, avec l'échantillon **réel** capturé sur le site
 * de démo Atlassian (`test/integration/live/`). Le site statique n'embarque donc
 * aucune logique métier : il montre exactement ce que le moteur produit.
 *
 * Relancer : `npm run site-data`
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildBrief } from '../../src/brief';
import { computeReadiness } from '../../src/readiness';
import type { Budget } from '../../src/types';
import { buildWorld, FIXTURES } from './fakeJira';

const BUDGETS: Budget[] = ['s', 'm', 'l'];
const ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(ROOT, 'site', 'assets');
const OUT_FILE = join(OUT_DIR, 'data.json');

/** Sélection : les scénarios les plus parlants pour un visiteur du site. */
const SELECTION = [
  'CMD-1', // ticket nominal complet
  'CMD-2', // sans description
  'CMD-4', // décisions contradictoires
  'CMD-5', // décision de plus de 18 mois
  'PAY-6', // commentaire avec instruction adressée à un agent
  'PAY-7', // secrets dans le ticket
  'PAY-13', // compte rendu sans tests
  'PAY-17', // périmètre non borné
  'PAY-23', // Confluence indisponible
  'PAY-26', // décisions nombreuses (troncature)
  'PAY-29', // ticket déjà réservé
  'PAY-30', // ticket modifié pendant le travail
];

function liveFile(name: string): Record<string, unknown> {
  const raw = readFileSync(join(ROOT, 'test', 'integration', 'live', name), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('export des données du site public', () => {
  it('écrit site/assets/data.json à partir du vrai moteur', async () => {
    const chosen = FIXTURES.filter((fixture) => SELECTION.includes(fixture.key));
    expect(chosen.length).toBeGreaterThanOrEqual(10);

    const tickets = [];
    for (const fixture of chosen) {
      const world = buildWorld(fixture);
      const issue = await world.briefDeps.collectIssue!(fixture.key);
      const settings = await world.briefDeps.collectProjectSettings!(fixture.projectKey);
      const decisions = await world.briefDeps.collectDecisions!(issue, settings);
      const attempts = await world.briefDeps.loadAttempts!(fixture.key);
      const readiness = computeReadiness(issue, settings, {
        decisions,
        comments: issue.comments,
        attempts,
      });

      const briefs: Record<string, unknown> = {};
      for (const budget of BUDGETS) {
        const brief = await buildBrief(fixture.key, budget, world.briefDeps);
        briefs[budget] = {
          tokenTarget: brief.tokenTarget,
          markdown: brief.markdown,
          sections: {
            objective: brief.objective.length,
            acceptanceCriteria: brief.acceptanceCriteria.length,
            applicableDecisions: brief.applicableDecisions.length,
            failedAttempts: brief.failedAttempts.length,
            neighborChanges: brief.neighborChanges.length,
            constraints: brief.constraints.length,
            lessons: brief.lessons.length,
            whoToAsk: brief.whoToAsk.length,
            gaps: brief.gaps.length,
            sources: brief.sources.length,
          },
          gaps: brief.gaps,
          truncatedSections: brief.truncatedSections ?? [],
        };
      }

      tickets.push({
        key: fixture.key,
        origin: 'simulated',
        scenario: fixture.scenario,
        projectKey: fixture.projectKey,
        summary: fixture.summary,
        status: fixture.status,
        readiness,
        briefs,
      });
    }

    const liveBrief = liveFile('pay6-brief.json');
    const liveReadiness = liveFile('pay6-readiness.json');
    const payload = {
      generatedAt: new Date().toISOString().slice(0, 10),
      engine: { budgets: BUDGETS, fixtures: FIXTURES.length, exported: tickets.length },
      live: {
        origin: 'live',
        site: liveBrief.site,
        environment: liveBrief.environment,
        appVersion: liveBrief.appVersion,
        capturedAt: liveBrief.capturedAt,
        issueKey: liveBrief.issueKey,
        durationMs: liveBrief.ms,
        readinessDurationMs: liveReadiness.durationMs,
        scenario: 'Ticket réel du site de démo Atlassian, brief produit par l’app déployée',
        readiness: liveReadiness,
        briefs: {
          [liveBrief.budget as string]: {
            tokenTarget: liveBrief.tokenTarget,
            markdown: liveBrief.markdown,
            sections: liveBrief.sections,
            gaps: liveBrief.gaps,
            truncatedSections: liveBrief.truncatedSections,
          },
        },
      },
      tickets,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 1)}\n`, 'utf-8');

    // Le fichier écrit doit être exploitable tel quel par le site.
    const written = JSON.parse(readFileSync(OUT_FILE, 'utf-8')) as typeof payload;
    expect(written.tickets).toHaveLength(tickets.length);
    expect(written.live.issueKey).toBe('PAY-6');
    for (const ticket of written.tickets) {
      for (const budget of BUDGETS) {
        const brief = ticket.briefs[budget] as { markdown: string };
        expect(brief.markdown.length).toBeGreaterThan(200);
        expect(brief.markdown).toContain('## 10. Sources');
      }
    }
  });
});
