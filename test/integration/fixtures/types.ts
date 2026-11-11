/**
 * Types partagés du harnais d'intégration (contrat § 2).
 *
 * C1 les définit, C2 les consomme. Les champs marqués « additif C1 » ne font
 * pas partie du contrat minimal : ils sont **optionnels** et servent à exprimer
 * ce que le socle attend du monde simulé (pannes, leçons, historique,
 * réservation, champs personnalisés). Un consommateur qui ne connaît que le
 * contrat les ignore sans risque.
 */

import type { ProjectSettings } from '../../../src/collect/types';
import type { TriggerOutcome } from '../../../src/events/triggers';
import type { AttemptRecord, ClaimRecord, LessonRecord } from '../../../src/storage/types';
import type { JiraClient, ConfluenceClient, TeamworkGraphClient } from '../../../src/collect/types';
import type { BriefDeps } from '../../../src/brief/builder';

/* ------------------------------------------------------------------ */
/* Types du contrat (C1 les exporte, C2 les consomme)                  */
/* ------------------------------------------------------------------ */

export interface DecisionSeed {
  title: string;
  body: string;
  url: string;
  date: string;
  author: string;
  via: 'confluence' | 'comment';
  /** Étiquettes de la page Confluence (additif C1). */
  labels?: string[];
  /** Clés citées par la page (additif C1) : le CQL filtre sur le texte. */
  mentions?: string[];
}

export interface AttemptSeed {
  at: string;
  agent: string;
  kind: 'pr-refusee' | 'reouverture' | 'compte-rendu' | 'ticket-clos';
  summary: string;
  reason: string;
  /** Statut technique de la tentative (défaut : déduit de `kind`). */
  status?: string;
  /** Critères couverts (défaut : aucun). */
  criteriaCovered?: string;
  /** Tests passés (défaut : aucun → « non vérifié par des tests »). */
  testsPassed?: string;
  /** Identifiant de la tentative (défaut : déduit de l'index). */
  id?: string;
}

export interface NeighborSeed {
  kind: 'pull-request' | 'commit';
  title: string;
  url: string;
  date: string;
  author: string;
  state?: string;
}

export interface CommentSeed {
  id: string;
  author: string;
  createdAt: string;
  body: string;
  visibility?: 'public' | 'restricted';
}

export interface LinkSeed {
  type: string;
  key: string;
  direction: 'inward' | 'outward';
  status?: string;
  title?: string;
  blocking?: boolean;
}

export interface ExpectedOutcome {
  readinessBucket: 'prêt' | 'à préciser' | 'non prêt';
  gapsExpected: string[];
  decisionsCited: number;
  criteriaCited: number;
  attemptsFirst?: string;
  mustAppear: string[];
  mustNotAppear: string[];
  holesExpected: string[];
  /** Nombre de changements voisins attendus (additif C1). */
  neighborsCited?: number;
}

/** Leçon de projet (additif C1) : issue des comptes rendus corrigés. */
export interface LessonSeed {
  text: string;
  component: string;
  createdAt: string;
  sourceAttemptId?: string;
  id?: string;
}

/** Entrée d'historique (additif C1) : réouverture, fermeture, changement. */
export interface HistorySeed {
  at: string;
  author: string;
  from: string;
  to: string;
}

/** Réservation d'un autre agent (additif C1). */
export interface ClaimSeed {
  agentName: string;
  userAccountId: string;
  expiresAt: string;
}

/** Champ personnalisé Jira (additif C1). */
export interface CustomFieldSeed {
  id: string;
  name: string;
  value: string;
}

/** Panne simulée d'un port (additif C1). */
export type Outage = 'confluence' | 'graph';

/**
 * Droits Jira de l'utilisateur appelant (additif C1) : couvre la recette S4 et
 * le cas § 17 « utilisateur sans droit de commenter ». Tout est vrai par défaut.
 */
export interface PermissionSeed {
  browse?: boolean;
  comment?: boolean;
  edit?: boolean;
}

/** Droit Jira vérifiable via `/mypermissions`. */
export type JiraPermission = 'BROWSE_PROJECTS' | 'ADD_COMMENTS' | 'EDIT_ISSUES';

export interface FixtureSpec {
  key: string;
  projectKey: string;
  scenario: string;
  summary: string;
  description?: string;
  status: string;
  issueType: string;
  components: string[];
  labels: string[];
  reporter: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  epicKey?: string;
  acceptanceCriteria?: string[];
  decisions?: DecisionSeed[];
  contradictions?: [string, string];
  attempts?: AttemptSeed[];
  neighbors?: NeighborSeed[];
  comments?: CommentSeed[];
  links?: LinkSeed[];
  constraints?: string;
  decisionLabels?: string[];
  expected: ExpectedOutcome;
  /** Champs personnalisés du ticket (additif C1). */
  customFields?: CustomFieldSeed[];
  /** Ports à faire tomber en panne (additif C1). */
  outages?: Outage[];
  /** Leçons du projet (additif C1). */
  lessons?: LessonSeed[];
  /** Historique du ticket (additif C1). */
  history?: HistorySeed[];
  /** Réservation active d'un autre agent (additif C1). */
  claim?: ClaimSeed;
  /** Réglages projet complémentaires (additif C1). */
  settings?: Partial<ProjectSettings>;
  /** Taille de page servie par le faux Jira (additif C1). */
  commentPageSize?: number;
  /** Droits de l'utilisateur appelant (additif C1). */
  permissions?: PermissionSeed;
}

/** État mutable du monde simulé (additif C1, utile aux assertions). */
export interface FakeWorldState {
  /** Date de dernière mise à jour du ticket (bouge si le ticket est modifié). */
  updatedAt: string;
  /** Le brief en cache est-il périmé (ticket modifié pendant le travail) ? */
  briefStale: boolean;
  issueReads: number;
  commentPages: number;
  changelogPages: number;
  devStatusReads: number;
  graphReads: number;
  confluenceReads: number;
  /** Tickets entrés dans la file de reconstruction. */
  queued: string[];
}

export interface FakeWorld {
  jira: JiraClient;
  confluence: ConfluenceClient;
  graph: TeamworkGraphClient;
  briefDeps: BriefDeps;
  fixture: FixtureSpec;
  state: FakeWorldState;
  attempts: AttemptRecord[];
  lessons: LessonRecord[];
  claim: ClaimRecord | null;
  /** Simule la modification du ticket pendant le travail (brief périmé). */
  simulateTicketUpdate(at?: string): Promise<TriggerOutcome[]>;
  /** Réservation active sur le ticket, expiration comprise (additif C1). */
  loadActiveClaim(issueKey: string, now?: Date): Promise<ClaimRecord | null>;
  /** Droits Jira résolus de l'utilisateur appelant (additif C1). */
  permissions: Required<PermissionSeed>;
  /** L'utilisateur appelant dispose-t-il de ce droit Jira ? (additif C1) */
  can(permission: JiraPermission): boolean;
}
