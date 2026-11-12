/**
 * Dépendances par défaut du moteur de brief.
 *
 * Le contrat prévoit des dépendances injectables (`BriefDeps`) pour que les
 * tests n'aient aucun appel réseau. En production, ce sont les vrais modules
 * qui sont branchés : collecte Jira/Confluence (WP-collect), stockage des
 * tentatives et des réglages (WP-storage), et **boucle d'apprentissage**
 * (`src/review`) pour les leçons — celles-ci arrivent déjà triées, rattachées à
 * leur tentative d'origine et marquées « anciennes » au-delà de 18 mois.
 *
 * Les imports sont **paresseux** (`require` dans la fonction) : charger le
 * moteur de brief hors runtime Forge ne doit pas charger `@forge/api`,
 * `@forge/sql` ni `@forge/llm`, et un échec de branchement doit rester explicite.
 */

import type { BriefDeps } from './builder';
import { passthroughCondenser } from './condenser';
import type { CondenseFn } from './condenser';
import type {
  DecisionRecord,
  IssueSnapshot,
  NeighborChange,
  ProjectSettings,
} from '../collect/types';
import type { AttemptRecord } from '../storage/types';
import type { BriefLesson } from './inputs';

type CollectModule = typeof import('../collect/issueCollector');
type StorageModule = typeof import('../storage');
type LlmModule = typeof import('../llm');
type ReviewModule = typeof import('../review');

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

function reviewModule(): ReviewModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../review') as ReviewModule;
}

/** Réglages projet : stockage d'abord, collecte Jira en repli. */
async function readSettings(projectKey: string): Promise<ProjectSettings> {
  const storage = storageModule();
  const stored = await storage.loadProjectSettings(projectKey);
  if (stored) return stored;
  return collectModule().collectProjectSettings(projectKey);
}

/** Variable d'environnement qui autorise la condensation par modèle. */
export const LLM_CONDENSATION_ENV = 'BRIEF_LLM_CONDENSATION';

/**
 * La condensation par modèle est-elle autorisée ?
 *
 * Seul `1` l'allume : toute autre valeur (absente, `0`, `true`, chaîne vide)
 * laisse le repli sans modèle. Un interrupteur binaire strict évite qu'une
 * valeur approximative n'engage une dépense par accident.
 */
export function llmCondensationEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[LLM_CONDENSATION_ENV] === '1';
}

/**
 * Condensation par modèle hébergé (lot langue/LLM).
 *
 * **Chemin facturé, donc éteint par défaut.** L'API Forge LLMs n'inclut aucun
 * quota gratuit : chaque jeton consommé est facturé au développeur de l'app
 * (Haiku 4.5 = 10 crédits par million de jetons, soit 1 $/M en entrée et 5 $/M
 * en sortie ; Sonnet 4.5 = 30 crédits ; Opus 4.6 = 50 crédits). L'allumer
 * d'office engagerait une dépense sans décision explicite : il faut poser
 * `BRIEF_LLM_CONDENSATION=1` sur l'environnement visé **puis redéployer** (une
 * variable Forge n'est prise en compte qu'au déploiement suivant).
 *
 * Éteinte, le moteur garde son comportement antérieur : le texte d'origine,
 * tronqué au budget (`passthroughCondenser`) — aucun appel réseau, aucun coût.
 *
 * Allumée, une instance par construction de brief : le condenseur porte un
 * **budget de temps de session** (20 s par défaut), donc trois budgets
 * précalculés restent sous les 2 min visées par le consumer, et une action MCP
 * sous ses 55 s. Un échec d'appel ne remonte jamais : le moteur garde le texte
 * d'origine.
 */
function createCondense(): CondenseFn {
  if (!llmCondensationEnabled()) return passthroughCondenser;
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
    loadLessons: (issueKey: string): Promise<BriefLesson[]> =>
      reviewModule().lessonsForIssue(issueKey),
    condense: createCondense(),
  };
}
