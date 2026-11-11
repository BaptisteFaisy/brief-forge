# Contrat d'implémentation — brief-forge

> Document de référence shared par tous les modules. Toute implémentation doit
> respecter ces signatures : les modules s'appellent entre eux, mais ne
> dépendent jamais du code d'un autre module autrement que par ces interfaces.

## 1. Arborescence et propriété des fichiers

| Chemin | Contenu | Propriétaire |
|---|---|---|
| `src/types.ts` | types partagés (déjà écrit) | socle |
| `src/config.ts` | constantes (budgets, poids, seuils) | socle |
| `src/security.ts` | primitives : masquage de secrets, détection d'injection | socle |
| `src/util/` | dates, jetons, markdown, erreurs | socle |
| `src/collect/` | collecte déterministe Jira / Confluence / Teamwork Graph | WP-collect |
| `src/brief/` | sections, budget, condensation, assemblage | WP-brief |
| `src/readiness/` | score de préparation | WP-readiness |
| `src/storage/` | schémas SQL + accès aux tables | WP-storage |
| `src/security/` | couche complète (règles + modèle + permissions) | WP-securite |
| `src/actions/` | 11 handlers d'actions MCP | WP-actions |
| `src/events/` | triggers Jira + consumer de file | WP-events |
| `src/ui/` | 3 écrans Jira + page d'aide connexion | WP-ui |
| `src/index.ts` | exporte tous les handlers référencés par le manifest | WP-manifest |
| `manifest.yml` | manifest Forge | WP-manifest |
| `skills/work-brief/SKILL.md` | skill Rovo | WP-manifest |
| `public-skill/SKILL.md` | `SKILL.md` ouvert (Claude Code / Cursor) | WP-manifest |
| `docs/` | documentation, guide des juges, script vidéo | WP-docs |
| `test/` | tests unitaires (par module) | tous |

## 2. Règles de code (non négociables)

1. **Un fichier < 500 lignes**, **une fonction < 50 lignes**. Au-delà : découper.
2. **Zéro duplication** : un helper partagé par logique, paramétré. Avant
   d'écrire, chercher l'existant (`src/util/`, `src/security.ts`).
3. TypeScript strict (`tsc --noEmit` doit passer), pas de `any` non justifié.
4. Aucun appel réseau dans les tests : on injecte des doublures.
5. Aucun secret en clair, aucun appel hors Atlassian (§ 16 « Données »).
6. Commentaires et messages en français, sauf l'identifiant public du produit.

## 3. Types partagés (extrait de `src/types.ts`)

```ts
type Budget = 's' | 'm' | 'l';
interface SourcedItem { text: string; source: string; date: string; stale?: boolean; }
interface BriefData {
  issueKey: string; budget: Budget; tokenTarget: number;
  objective: string;
  acceptanceCriteria: SourcedItem[];
  applicableDecisions: SourcedItem[];
  failedAttempts: SourcedItem[];
  neighborChanges: SourcedItem[];
  constraints: SourcedItem[];
  lessons: SourcedItem[];
  whoToAsk: SourcedItem[];
  gaps: string[];
  sources: Array<{ label: string; url: string; date: string }>;
  truncatedSections?: string[];
  markdown: string;
}
interface GapExplanation { criterion: string; pointsLost: number; reason: string; }
interface ReadinessScore {
  issueKey: string; score: number; ready: boolean;
  status: 'prêt' | 'à préciser' | 'non prêt';
  gaps: GapExplanation[]; advice: string;
}
```

## 4. Interfaces internes (signatures exactes)

### 4.1 Collecte — `src/collect/`

```ts
// src/collect/types.ts
export interface IssueSnapshot {
  issueKey: string; projectKey: string; summary: string; description: string;
  status: string; issueType: string; components: string[]; labels: string[];
  reporter: string; assignee: string; createdAt: string; updatedAt: string;
  epicKey?: string; acceptanceCriteria: string[]; links: IssueLink[];
  comments: IssueComment[]; history: IssueHistoryEntry[];
  customFields: Record<string, string>;
}
export interface IssueLink { type: string; key: string; direction: 'inward' | 'outward'; status?: string; title?: string; }
export interface IssueComment { id: string; author: string; createdAt: string; body: string; visibility?: 'public' | 'restricted'; }
export interface IssueHistoryEntry { at: string; author: string; summary: string; kind: 'reopened' | 'closed' | 'status' | 'linked'; }
export interface DecisionRecord { title: string; url: string; date: string; author: string; body: string; }
export interface NeighborChange { kind: 'pull-request' | 'commit'; title: string; url: string; date: string; author: string; state?: string; }
export interface ProjectSettings {
  projectId: string; projectKey: string;
  acceptanceCriteriaField?: string; triggerStatus: string; triggerLabel?: string;
  constraintsText?: string; decisionLabels: string[]; componentZone?: string;
}

// Fonctions (toutes pures ou/mockables) :
export function collectIssue(issueKey: string): Promise<IssueSnapshot>;
export function collectDecisions(issue: IssueSnapshot, settings: ProjectSettings): Promise<DecisionRecord[]>;
export function collectNeighborChanges(issue: IssueSnapshot): Promise<NeighborChange[]>;
export function collectProjectSettings(projectKey: string): Promise<ProjectSettings>;
```

### 4.2 Brief — `src/brief/`

```ts
// src/brief/builder.ts
export function buildBrief(
  issueKey: string,
  budget: Budget,
  deps?: BriefDeps
): Promise<BriefData>;
export interface BriefDeps {
  collectIssue?: typeof collectIssue;
  collectDecisions?: typeof collectDecisions;
  collectNeighborChanges?: typeof collectNeighborChanges;
  collectProjectSettings?: typeof collectProjectSettings;
  loadAttempts?: (issueKey: string) => Promise<AttemptRecord[]>;
  loadLessons?: (issueKey: string) => Promise<LessonRecord[]>;
  condense?: (input: CondenseInput) => Promise<string>;
  readSettings?: (projectKey: string) => Promise<ProjectSettings>;
}
export interface CondenseInput { text: string; budgetTokens: number; keepSources: boolean; }
```

Ordre des sections (§ 7.1) : Objectif, Critères d'acceptation, Décisions
applicables, Déjà tenté, Changements voisins, Contraintes, Leçons, À qui
demander, Trous, Sources. Chaque élément porte **une source et une date**
(BC-02). Une section tronquée **le dit** et **nomme l'outil** qui donne la suite
(ex. « 4 autres décisions : `get-related-decisions` »).

### 4.3 Préparation — `src/readiness/`

```ts
export function computeReadiness(
  issue: IssueSnapshot,
  settings: ProjectSettings,
  extras?: { decisions?: DecisionRecord[]; comments?: IssueComment[]; attempts?: AttemptRecord[] }
): ReadinessScore;
```
Poids : critères vérifiables 30, périmètre borné 15, aucun lien bloquant 15,
aucune décision contradictoire 10, auteur joignable 10, aucune question sans
réponse 10, composant identifié 10. ≥ 70 prêt, 40–69 à préciser, < 40 non prêt.
Chaque point perdu est expliqué (`gaps[]`).

### 4.4 Stockage — `src/storage/`

```ts
export interface AttemptRecord { id: string; issueKey: string; agentName: string; userAccountId: string;
  startedAt: string; status: string; reportMd: string; criteriaCovered: string; testsPassed: string; }
export interface LessonRecord { id: string; projectKey: string; component: string; text: string;
  sourceAttemptId: string; createdAt: string; }
export interface ClaimRecord { issueKey: string; agentName: string; userAccountId: string; expiresAt: string; }
export interface StoredBrief { issueKey: string; budget: Budget; contentMd: string; contentJson: string;
  sourcesJson: string; builtAt: string; stale: boolean; }
// Repos :
export function saveBrief(brief: BriefData, builtAt: string): Promise<void>;
export function loadBrief(issueKey: string, budget: Budget): Promise<StoredBrief | null>;
export function markBriefStale(issueKey: string): Promise<void>;
export function saveReadiness(score: ReadinessScore, computedAt: string): Promise<void>;
export function loadReadiness(issueKey: string): Promise<ReadinessScore | null>;
export function saveAttempt(attempt: AttemptRecord): Promise<void>;
export function loadAttempts(issueKey: string): Promise<AttemptRecord[]>;
export function saveLesson(lesson: LessonRecord): Promise<void>;
export function loadLessons(issueKey: string): Promise<LessonRecord[]>;
export function saveClaim(claim: ClaimRecord): Promise<void>;
export function loadActiveClaim(issueKey: string): Promise<ClaimRecord | null>;
export function releaseClaim(issueKey: string): Promise<void>;
export function logAccess(issueKey: string, tool: string, userAccountId: string, at: string): Promise<void>;
export function loadProjectSettings(projectKey: string): Promise<ProjectSettings | null>;
export function saveProjectSettings(settings: ProjectSettings): Promise<void>;
```

Tables (modèle § 14) : `brief`, `readiness`, `attempt`, `review`, `lesson`,
`claim`, `access_log`, `project_settings`. Pas de clés étrangères, DDL
idempotent (`CREATE TABLE IF NOT EXISTS`), pas d'`AUTO_INCREMENT`.

### 4.5 Sécurité — `src/security/`

```ts
export function sanitizeForBrief(text: string, meta: { author: string; date: string }): string;
export async function detectInstructionViaModel(text: string): Promise<boolean>;
export async function assertIssueAccess(issueKey: string, accountId?: string): Promise<void>; // lève PermissionDeniedError
export function maskSecrets(text: string): string;
```
Règle : le contenu tiers est **cité** (bloc `>`), préfixé de sa source, et
jamais interprété comme une instruction. Le brief rappelle en en-tête que les
blocs sont des données.

### 4.6 Actions — `src/actions/`

Chaque handler : `export async function xxx(payload: any, context: any): Promise<any>`
(identique au contrat Forge). Les entrées ne sont que chaînes, entiers,
nombres, booléens. Une action dispose de 55 s.

| Clé d'action | Verbe | Entrées |
|---|---|---|
| `get-work-brief` | GET | `issueKey`, `budget` |
| `check-readiness` | GET | `issueKey` |
| `get-acceptance-criteria` | GET | `issueKey` |
| `get-related-decisions` | GET | `issueKey` |
| `get-failed-attempts` | GET | `issueKey` |
| `get-neighbor-changes` | GET | `issueKey` |
| `list-ready-work` | GET | `projectKey` |
| `ask-clarification` | CREATE | `issueKey`, `question` |
| `post-work-report` | CREATE | `issueKey`, `status`, `report`, `criteriaCovered`, `testsPassed` |
| `record-failed-attempt` | CREATE | `issueKey`, `summary`, `reason` |
| `claim-work` | UPDATE | `issueKey`, `agentName` |

Règles d'écriture : commenter, étiqueter, poser une propriété — **jamais**
changer statut, assigné ni version. Un compte rendu sans tests est accepté
mais affiché avec l'avertissement « non vérifié par des tests ».

### 4.7 Événements — `src/events/`

Triggers Jira : `avi:jira:updated:issue`, `avi:jira:commented:issue`,
`avi:jira:created:issuelink`, `avi:jira:deleted:issuelink`. Effet : marquer le
brief périmé et, si le ticket est au statut déclencheur, le mettre dans la file
de construction. Le consumer construit les trois budgets.

## 5. Format du compte rendu attendu

```markdown
## Statut : terminé | partiel | bloqué | abandonné
## Fait
## Non fait
## Critères couverts : 1, 2, 4
## Hypothèses prises
## Tests lancés et résultat
## Suites proposées
```
Mention obligatoire : « Rédigé par un agent (nom du client) pour le compte de
(utilisateur) ».
