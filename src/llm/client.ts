/**
 * Client LLM de brief-forge (WP-llm).
 *
 * Enveloppe fine de `@forge/llm`, avec trois garanties :
 * 1. **chargement paresseux** du paquet (`require` dans la fonction, comme
 *    `@forge/api` dans `src/collect/issueCollector.ts`) : hors runtime Forge,
 *    ni l'import ni les tests ne chargent le SDK ;
 * 2. **sortie texte** : `message.content` est une chaîne **ou** un tableau de
 *    blocs `{type:'text'}` — les deux formes sont acceptées et concaténées ;
 * 3. **aucune erreur ne remonte au brief** : modèle absent, refus de
 *    paramètre, timeout, réponse inexploitable → `complete` rend `null`, et le
 *    moteur applique son repli (texte d'origine).
 *
 * `temperature` et `top_p` ne sont **jamais** envoyés : ils sont mutuellement
 * exclusifs et plusieurs modèles hébergés les refusent.
 */

import { withTimeout } from '../util/timeout';
import { resolveModel } from './modelPicker';
import type {
  LlmChatRequest,
  LlmChatResult,
  LlmClient,
  LlmContent,
  LlmModelList,
  LlmPort,
  LlmTextPart,
} from './types';

/** Délai par appel modèle : la condensation est un luxe, pas une dépendance. */
export const DEFAULT_TIMEOUT_MS = 8_000;

export interface LlmClientOptions {
  timeoutMs?: number;
  families?: readonly string[];
  fallbackModel?: string;
}

/** Surface de `@forge/llm` réellement utilisée. */
interface ForgeLlmModule {
  list(): Promise<LlmModelList>;
  chat(request: LlmChatRequest): Promise<LlmChatResult>;
}

function forgeLlmModule(): ForgeLlmModule {
  // Chargement paresseux : jamais atteint hors runtime Forge (tests inclus).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@forge/llm') as ForgeLlmModule;
}

/** Port branché sur le SDK Forge, résolu seulement au moment de l'appel. */
export function forgeLlmPort(): LlmPort {
  return {
    list: async () => forgeLlmModule().list(),
    chat: async (request: LlmChatRequest) => forgeLlmModule().chat(request),
  };
}

function isTextPart(part: unknown): part is LlmTextPart {
  return Boolean(part) && typeof part === 'object' && (part as LlmTextPart).type === 'text';
}

/**
 * Texte d'une réponse : chaîne telle quelle, ou blocs `text` concaténés.
 * Toute autre forme (outil, image, `null`) rend une chaîne vide.
 */
export function contentToText(content: LlmContent | undefined | null): string {
  if (content === undefined || content === null) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextPart)
    .map((part) => part.text ?? '')
    .join('\n');
}

/** Texte du premier choix de la réponse (les autres ne sont pas demandés). */
export function extractText(result: LlmChatResult | undefined | null): string {
  const choice = result?.choices?.[0];
  return contentToText(choice?.message?.content).trim();
}

/** Détail d'une erreur Forge : le corps de réponse porte le vrai motif. */
export function describeLlmError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: { responseText?: unknown } } | undefined)?.context;
  const body = typeof context?.responseText === 'string' ? context.responseText : '';
  return body ? `${base} — ${body}` : base;
}

/** Client de production : port Forge + garde de temps + repli `null`. */
export function createLlmClient(port: LlmPort, options: LlmClientOptions = {}): LlmClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    list: () => port.list(),
    chat: (request: LlmChatRequest) => withTimeout(port.chat(request), timeoutMs),
    async complete(system: string, user: string, maxTokens: number): Promise<string | null> {
      try {
        const model = await resolveModel(port, {
          families: options.families,
          fallback: options.fallbackModel,
        });
        const result = await withTimeout(
          port.chat({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_completion_tokens: maxTokens,
          }),
          timeoutMs
        );
        const text = extractText(result);
        return text === '' ? null : text;
      } catch (error) {
        console.warn(`[llm] condensation ignorée : ${describeLlmError(error)}`);
        return null;
      }
    },
  };
}

/** Client par défaut, branché sur `@forge/llm` (résolu au premier appel). */
export function defaultLlmClient(options: LlmClientOptions = {}): LlmClient {
  return createLlmClient(forgeLlmPort(), options);
}
