/**
 * Surface minimale de `@forge/llm` que brief-forge utilise (WP-llm).
 *
 * Les types sont **redéclarés** volontairement, et non importés du paquet :
 * `@forge/llm` n'est chargé qu'au moment d'un appel réel (chargement paresseux,
 * comme `@forge/api` dans `src/collect/issueCollector.ts`), sinon importer le
 * module hors runtime Forge ferait planter les tests unitaires.
 *
 * Deux particularités de l'API réelle sont représentées ici :
 * - `content` d'un message est **une chaîne OU un tableau de blocs** `text` ;
 * - `temperature` et `top_p` sont **mutuellement exclusifs** et refusés par
 *   plusieurs modèles : on ne les envoie jamais (voir `LlmChatRequest`).
 */

/** Rôles acceptés par `chat` (seuls ceux-ci sont produits par brief-forge). */
export type LlmRole = 'system' | 'user' | 'assistant';

/** Bloc de texte renvoyé par certains modèles. */
export interface LlmTextPart {
  type: 'text';
  text: string;
}

/** Contenu d'un message : chaîne simple ou blocs. */
export type LlmContent = string | LlmTextPart[];

/** Message envoyé au modèle. */
export interface LlmMessage {
  role: LlmRole;
  content: string;
}

/** Un modèle tel que déclaré par `list()`. */
export interface LlmModelInfo {
  model: string;
  status: 'active' | 'deprecated';
}

export interface LlmModelList {
  models: LlmModelInfo[];
}

/** Un choix de réponse, avec le motif d'arrêt et le message du modèle. */
export interface LlmChatChoice {
  finish_reason?: string;
  message?: { role?: string; content?: LlmContent };
}

export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface LlmChatResult {
  choices: LlmChatChoice[];
  usage?: LlmUsage;
}

/**
 * Requête `chat` : modèle, messages, plafond de jetons de sortie.
 * Aucun `temperature` ni `top_p` (refusés par plusieurs modèles hébergés).
 */
export interface LlmChatRequest {
  model: string;
  messages: LlmMessage[];
  max_completion_tokens?: number;
}

/**
 * Port LLM : la seule surface dont le client a besoin. En test, une doublure
 * remplace ce port ; en production, il est câblé sur `@forge/llm`.
 */
export interface LlmPort {
  list(): Promise<LlmModelList>;
  chat(request: LlmChatRequest): Promise<LlmChatResult>;
}

/**
 * Client de haut niveau utilisé par le moteur de brief.
 *
 * `complete` rend **du texte** (chaîne, ou blocs concaténés) et **`null`** en
 * cas d'échec : aucune erreur ne remonte jamais au brief, qui applique alors
 * son repli (texte d'origine).
 */
export interface LlmClient {
  list(): Promise<LlmModelList>;
  chat(request: LlmChatRequest): Promise<LlmChatResult>;
  complete(system: string, user: string, maxTokens: number): Promise<string | null>;
}
