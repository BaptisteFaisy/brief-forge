/**
 * Banc LOCAL de condensation branché sur InferHub — **hors de l'app Forge**.
 *
 * Pourquoi un banc et pas un branchement dans l'app : faire sortir le contenu
 * des tickets vers un fournisseur externe depuis le code déployé serait un
 * egress de données utilisateur, ce qui fait perdre l'éligibilité « Runs on
 * Atlassian » (la doc exige « must not egress data », hors analytics). Ce banc
 * ne modifie donc **rien** à l'app : il exerce la même tuyauterie —
 * `boundInput`, `condenseSystemPrompt`/`condenseUserPrompt`, `resolveModel`,
 * `createLlmClient`, `cleanModelAnswer`, `keepAttributable`, repli sur le texte
 * d'origine — en ne remplaçant que le transport (`LlmPort`).
 *
 * Désactivé par défaut : ne tourne que si `INFERHUB_LIVE=1` **et**
 * `INFERHUB_API_KEY`. La clé n'est jamais imprimée ni écrite.
 *
 * Données envoyées : descriptions des captures du site de **démonstration**
 * (tickets fabriqués). Garde explicite : PAY-6 est exclu (il porte les pièges
 * semés, dont un faux jeton) et tout texte ressemblant à un secret est rejeté.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  createLlmClient,
  createModelCondenser,
  isGrounded,
  resetModelCache,
} from '../../src/llm';
import type { LlmChatRequest, LlmChatResult, LlmPort } from '../../src/llm/types';
import { estimateTokens } from '../../src/util/tokens';

const LIVE = process.env.INFERHUB_LIVE === '1';
const describeLive = LIVE ? describe : describe.skip;

const BASE_URL = process.env.INFERHUB_URL ?? 'https://api.inferhub.dev/v1';
const MODEL = process.env.INFERHUB_MODEL ?? 'mm/MiniMax-M3.1-Flash';
const API_KEY = process.env.INFERHUB_API_KEY ?? '';
const CAPTURES = process.env.CAPTURES_DIR ?? '/tmp/live-captures';

/**
 * Timeout du client pendant le banc.
 *
 * 8 000 ms est la valeur **de production** (`DEFAULT_TIMEOUT_MS` dans
 * `src/llm/client.ts`) — et le banc montre qu'elle est **insuffisante** sur la
 * route InferHub : la latence mesurée va de ~2,7 s (route chanceuse) à plus de
 * 30 s (fournisseur saturé). Le banc, lui, n'a pas de deadline métier : il
 * mesure. Surchargeable par `BENCH_TIMEOUT_MS`.
 */
const BENCH_TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS ?? 45_000);

/** Ce qui ressemble à un secret : on refuse de l'envoyer à un tiers. */
const SECRET_LIKE = /(ghp_|gho_|sk-[A-Za-z0-9_-]{12}|AKIA[0-9A-Z]{12}|BEGIN [A-Z ]*PRIVATE KEY)/;

/** Compteurs d'usage, pour chiffrer la démonstration. */
interface Stats {
  calls: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
}

interface OpenAiResult {
  choices?: Array<{ finish_reason?: string; message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** Adaptateur InferHub (compatible OpenAI) vers le `LlmPort` du projet. */
function inferHubPort(stats: Stats): LlmPort {
  return {
    list: async () => ({ models: [{ model: MODEL, status: 'active' as const }] }),
    chat: async (request: LlmChatRequest): Promise<LlmChatResult> => {
      const started = Date.now();
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_completion_tokens,
          // Le raisonnement est le piège de ce banc : `combo/cheap` et
          // MiniMax M3.1 Flash l'utilisent par défaut, et il dévore le budget
          // de sortie (120 jetons de raisonnement pour 0 caractère utile, 87 s
          // d'attente). Désactivé : 2,7 s et un vrai résumé.
          reasoning_effort: 'none',
          enable_thinking: false,
        }),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(`InferHub ${response.status} : ${body}`);
      }
      const payload = (await response.json()) as OpenAiResult;
      const choice = payload.choices?.[0];
      stats.calls += 1;
      stats.ms += Date.now() - started;
      stats.inputTokens += payload.usage?.prompt_tokens ?? 0;
      stats.outputTokens += payload.usage?.completion_tokens ?? 0;
      return {
        choices: [
          {
            finish_reason: choice?.finish_reason,
            message: { role: 'assistant', content: choice?.message?.content ?? '' },
          },
        ],
        usage: {
          input_tokens: payload.usage?.prompt_tokens,
          output_tokens: payload.usage?.completion_tokens,
          total_tokens: payload.usage?.total_tokens,
        },
      };
    },
  };
}

/** Texte long réel : descriptions du site de démo, sans piège ni secret. */
function longTextFromCaptures(minChars: number): string {
  const parts: string[] = [];
  let total = 0;
  for (const file of readdirSync(CAPTURES).filter((f) => f.endsWith('.json')).sort()) {
    const key = file.replace('.json', '');
    if (key === 'PAY-6') continue; // pièges semés, dont un faux jeton
    const capture = JSON.parse(readFileSync(join(CAPTURES, file), 'utf8')) as {
      issue?: { summary?: string; description?: string };
    };
    const text = [capture.issue?.summary, capture.issue?.description]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' — ');
    if (!text || SECRET_LIKE.test(text)) continue;
    parts.push(`[${key}] ${text}`);
    total += text.length;
    if (total >= minChars) break;
  }
  return parts.join('\n\n');
}

describeLive('banc InferHub : condensation réelle, hors app Forge', () => {
  const stats: Stats = { calls: 0, ms: 0, inputTokens: 0, outputTokens: 0 };
  const text = longTextFromCaptures(1200);

  beforeAll(() => {
    if (!API_KEY) throw new Error('INFERHUB_API_KEY absente : banc inutilisable');
  });

  beforeEach(() => resetModelCache());

  it('condense réellement un texte long, dans le budget demandé', async () => {
    const condense = createModelCondenser({
      client: createLlmClient(inferHubPort(stats), { timeoutMs: BENCH_TIMEOUT_MS }),
    });

    const out = await condense({ text, budgetTokens: 120, keepSources: true });

    const before = estimateTokens(text);
    const after = estimateTokens(out);
    // eslint-disable-next-line no-console
    console.log(
      `\n[BANC] modèle=${MODEL} appels=${stats.calls} latence=${stats.ms} ms\n` +
        `[BANC] entrée=${text.length} car. (~${before} jetons) → sortie=${out.length} car. (~${after} jetons)\n` +
        `[BANC] jetons facturés : ${stats.inputTokens} en entrée, ${stats.outputTokens} en sortie\n` +
        `[BANC] rendu :\n${out}\n`
    );

    expect(out.trim().length).toBeGreaterThan(0);
    // Route saturée : le repli a tenu (texte d'origine rendu, aucune erreur
    // remontée). C'est le comportement attendu, pas un échec du banc.
    if (stats.calls === 0) {
      // eslint-disable-next-line no-console
      console.log('[BANC] aucun appel abouti (latence de la route) : repli vérifié.');
      expect(out).toBe(text);
      return;
    }
    expect(estimateTokens(out)).toBeLessThan(estimateTokens(text));
    expect(isGrounded(out, text)).toBe(true); // rattachable à la source : pas d'invention
  }, 120_000);

  it('un budget plus serré produit un texte plus court', async () => {
    const condense = createModelCondenser({
      client: createLlmClient(inferHubPort(stats), { timeoutMs: BENCH_TIMEOUT_MS }),
    });

    const avantLarge = stats.calls;
    const large = await condense({ text, budgetTokens: 300, keepSources: true });
    const reussiLarge = stats.calls > avantLarge;

    const avantSerre = stats.calls;
    const serre = await condense({ text, budgetTokens: 80, keepSources: true });
    const reussiSerre = stats.calls > avantSerre;

    // eslint-disable-next-line no-console
    console.log(
      `\n[BANC] budget 300 → ${estimateTokens(large)} jetons ; budget 80 → ${estimateTokens(serre)} jetons` +
        `\n[BANC] cumul : ${stats.calls} appels, ${stats.ms} ms, ${stats.inputTokens}+${stats.outputTokens} jetons`
    );
    // La comparaison n'a de sens que si les deux appels ont abouti : sinon l'un
    // des deux a rendu le texte d'origine (repli après timeout), ce qui ne dit
    // rien du budget.
    if (reussiLarge && reussiSerre) {
      expect(estimateTokens(serre)).toBeLessThanOrEqual(estimateTokens(large));
    } else {
      // eslint-disable-next-line no-console
      console.log('[BANC] au moins un appel n’a pas abouti (latence de la route) : comparaison non applicable.');
    }
  }, 150_000);

  it('panne du fournisseur : le texte d’origine est rendu, rien ne remonte', async () => {
    const portEnPanne: LlmPort = {
      list: async () => ({ models: [] }),
      chat: async () => {
        throw new Error('InferHub 503 : fournisseur indisponible');
      },
    };
    const condense = createModelCondenser({ client: createLlmClient(portEnPanne) });

    await expect(condense({ text, budgetTokens: 60, keepSources: true })).resolves.toBe(text);
  });

  it('réponse hors sujet : l’élément est jeté, jamais repêché', async () => {
    const portHorsSujet: LlmPort = {
      list: async () => ({ models: [{ model: MODEL, status: 'active' }] }),
      chat: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Bonjour, je suis un modèle.' } }],
      }),
    };
    const condense = createModelCondenser({ client: createLlmClient(portHorsSujet) });

    await expect(condense({ text, budgetTokens: 60, keepSources: true })).resolves.toBe('');
  });
});
