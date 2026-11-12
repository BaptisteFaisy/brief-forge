/**
 * Point d'entrée du client LLM (WP-llm).
 *
 * Rien ici ne charge `@forge/llm` à l'importation : le SDK n'est résolu qu'au
 * moment d'un appel réel (`require` paresseux dans `client.ts`). Le moteur de
 * brief et ses tests peuvent donc importer ce module hors runtime Forge.
 */

export {
  DEFAULT_TIMEOUT_MS,
  contentToText,
  createLlmClient,
  defaultLlmClient,
  describeLlmError,
  extractText,
  forgeLlmPort,
} from './client';
export type { LlmClientOptions } from './client';

export {
  FALLBACK_MODEL,
  PREFERRED_FAMILIES,
  activeModels,
  cachedModelName,
  compareModels,
  isPreferredFamily,
  modelRank,
  pickModel,
  resetModelCache,
  resolveModel,
} from './modelPicker';
export type { ResolveModelOptions } from './modelPicker';

export {
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  boundInput,
  condenseSystemPrompt,
  condenseUserPrompt,
  outputTokensFor,
} from './prompt';

export {
  DEFAULT_SESSION_BUDGET_MS,
  cleanModelAnswer,
  createModelCondenser,
  isGrounded,
  keepAttributable,
} from './condense';
export type { ModelCondenserOptions } from './condense';

export type {
  LlmChatChoice,
  LlmChatRequest,
  LlmChatResult,
  LlmClient,
  LlmContent,
  LlmMessage,
  LlmModelInfo,
  LlmModelList,
  LlmPort,
  LlmRole,
  LlmTextPart,
  LlmUsage,
} from './types';
