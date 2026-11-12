/**
 * Dépendances par défaut du moteur de brief.
 *
 * Le contrat prévoit des dépendances injectables (`BriefDeps`) pour que les
 * tests n'aient aucun appel réseau. En production, ce sont les vrais modules
 * qui sont branchés : collecte Jira/Confluence (WP-collect) et stockage des
 * tentatives, des leçons et des réglages (WP-storage).
 *
 * Les imports sont **paresseux** (`require` dans la fonction) : charger le
 * moteur de brief hors runtime Forge ne doit pas charger `@forge/api`,
 * `@forge/sql` ni `@forge/llm`, et un échec de branchement doit rester explicite.
 */

import type { BriefDeps } from './builder';
import type { CondenseFn } from './condenser';
import type {
  DecisionRecord,
  IssueSnapshot,
  NeighborChange,
  ProjectSettings,
} from '../collect/types';
import type { AttemptRecord, LessonRecord } from '../storage/types';

type CollectModule = typeof import('../collect/issueCollector');
type StorageModule = typeof import('../storage');
type LlmModule = typeof import('../llm');

function collectModule(): CollectModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../collect/issueCollector') as CollectModule;
}

function storageModule(): StorageModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../storage') as StorageModule;
}

function llmModule(): LlmModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../llm') as LlmModule;
}

/** Réglages projet : stockage d'abord, collecte Jira en repli. */
async function readSettings(projectKey: string): Promise<ProjectSettings> {
  const storage = storageModule();
  const stored = await storage.loadProjectSettings(projectKey);
  if (stored) return stored;
  return collectModule().collectProjectSettings(projectKey);
}

/**
 * Condensation par modèle hébergé (lot langue/LLM).
 *
 * Une instance par construction de brief : le condenseur porte un **budget de
 * temps de session** (20 s par défaut), donc trois budgets précalculés restent
 * sous les 2 min visées par le consumer, et une action MCP sous ses 55 s.
 * Un échec d'appel ne remonte jamais : le moteur garde le texte d'origine.
 */
function createCondense(): CondenseFn {
  return llmModule().createModelCondenser();
}

/** Dépendances par défaut (production). Injectables pour les tests. */
export function defaultBriefDeps(): BriefDeps {
  return {
    collectIssue: (issueKey: string): Promise<IssueSnapshot> =>
      collectModule().collectIssue(issueKey),
    collectDecisions: (
      issue: IssueSnapshot,
      settings: ProjectSettings
    ): Promise<DecisionRecord[]> => collectModule().collectDecisions(issue, settings),
    collectNeighborChanges: (issue: IssueSnapshot): Promise<NeighborChange[]> =>
      collectModule().collectNeighborChanges(issue),
    readSettings,
    loadAttempts: (issueKey: string): Promise<AttemptRecord[]> =>
      storageModule().loadAttempts(issueKey),
    loadLessons: (issueKey: string): Promise<LessonRecord[]> =>
      storageModule().loadLessons(issueKey),
    condense: createCondense(),
  };
}
