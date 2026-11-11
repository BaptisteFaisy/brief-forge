/**
 * Types et contrats de la collecte déterministe (WP-collect).
 *
 * Ce fichier ne contient aucune logique : uniquement les formes de données du
 * contrat (§ 4.1) et les interfaces des clients injectables (Jira, Confluence,
 * Teamwork Graph). L'injection permet aux tests de substituer des doublures
 * sans aucun appel réseau.
 */

export interface IssueSnapshot {
  issueKey: string;
  projectKey: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  components: string[];
  labels: string[];
  reporter: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  epicKey?: string;
  acceptanceCriteria: string[];
  links: IssueLink[];
  comments: IssueComment[];
  history: IssueHistoryEntry[];
  customFields: Record<string, string>;
}

export interface IssueLink {
  type: string;
  key: string;
  direction: 'inward' | 'outward';
  status?: string;
  title?: string;
}

export interface IssueComment {
  id: string;
  author: string;
  createdAt: string;
  body: string;
  visibility?: 'public' | 'restricted';
  /**
   * Vrai si le contenu a été écarté par la couche de sécurité (instruction
   * adressée à un agent) : `body` ne contient alors que la mention d'écart.
   * Le brief doit le **signaler** (§ 13, BC-03) au lieu de le taire.
   */
  discarded?: boolean;
}

export interface IssueHistoryEntry {
  at: string;
  author: string;
  summary: string;
  kind: 'reopened' | 'closed' | 'status' | 'linked';
}

export interface DecisionRecord {
  title: string;
  url: string;
  date: string;
  author: string;
  body: string;
}

export interface NeighborChange {
  kind: 'pull-request' | 'commit';
  title: string;
  url: string;
  date: string;
  author: string;
  state?: string;
}

export interface ProjectSettings {
  projectId: string;
  projectKey: string;
  acceptanceCriteriaField?: string;
  triggerStatus: string;
  triggerLabel?: string;
  constraintsText?: string;
  decisionLabels: string[];
  componentZone?: string;
}

/** Réponse HTTP minimale, compatible avec l'objet `Response` de Forge. */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface TransportInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Transport HTTP d'un produit Atlassian (Jira ou Confluence). */
export type Transport = (
  path: string,
  init?: TransportInit
) => Promise<HttpResponseLike>;

/** Transport GraphQL du Teamwork Graph. */
export type GraphTransport = (
  query: string,
  variables?: Record<string, unknown>
) => Promise<HttpResponseLike>;

/** Accès Jira en lecture, au nom de l'utilisateur appelant. */
export interface JiraClient {
  fetchIssue(issueKey: string): Promise<Record<string, unknown>>;
  fetchComments(issueKey: string): Promise<unknown[]>;
  fetchChangelog(issueKey: string): Promise<unknown[]>;
  fetchProject(projectKey: string): Promise<Record<string, unknown>>;
  fetchFields(): Promise<unknown[]>;
  fetchDevStatus(issueId: string): Promise<Record<string, unknown>>;
  resolveIssueId(issueKey: string): Promise<string>;
}

/** Accès Confluence en lecture (pages de décision étiquetées). */
export interface ConfluenceClient {
  searchPagesByLabels(
    labels: string[],
    issueKey?: string
  ): Promise<unknown[]>;
  fetchPageContent(pageId: string): Promise<string>;
}

export interface NeighborQueryInput {
  issueKey: string;
  componentNames: string[];
  linkedKeys: string[];
  since: string;
}

/** Accès Teamwork Graph en lecture (changements voisins). */
export interface TeamworkGraphClient {
  fetchNeighborChanges(input: NeighborQueryInput): Promise<unknown>;
}

/** Sous-ensemble de `asUser()` de @forge/api réellement utilisé. */
export interface ForgeUserApi {
  requestJira(
    route: unknown,
    init?: TransportInit
  ): Promise<HttpResponseLike>;
  requestConfluence(
    route: unknown,
    init?: TransportInit
  ): Promise<HttpResponseLike>;
  requestTeamworkGraph(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<HttpResponseLike>;
}

/** Forme du module @forge/api chargé paresseusement (jamais en test). */
export interface ForgeModule {
  route?(strings: TemplateStringsArray, ...values: unknown[]): unknown;
  asUser?(userId?: string): ForgeUserApi;
  default?: { asUser?(userId?: string): ForgeUserApi };
}
