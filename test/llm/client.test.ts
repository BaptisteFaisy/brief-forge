/**
 * Client LLM : sortie texte (chaîne ou blocs), aucun paramètre refusé envoyé,
 * et surtout **aucune erreur remontée** — un échec rend `null` et laisse le
 * moteur appliquer son repli. Aucun appel réseau : le port est une doublure.
 */

import {
  DEFAULT_TIMEOUT_MS,
  contentToText,
  createLlmClient,
  describeLlmError,
  extractText,
} from '../../src/llm/client';
import { FALLBACK_MODEL, resetModelCache } from '../../src/llm/modelPicker';
import type { LlmChatRequest, LlmChatResult, LlmModelInfo, LlmPort, LlmTextPart } from '../../src/llm/types';

interface FakePortOptions {
  models?: LlmModelInfo[];
  chat?: (request: LlmChatRequest) => Promise<LlmChatResult>;
  listError?: Error;
}

function fakePort(options: FakePortOptions = {}): LlmPort & { requests: LlmChatRequest[] } {
  const port = {
    requests: [] as LlmChatRequest[],
    async list() {
      if (options.listError) throw options.listError;
      return { models: options.models ?? [{ model: 'claude-haiku-4-5', status: 'active' as const }] };
    },
    async chat(request: LlmChatRequest) {
      port.requests.push(request);
      if (!options.chat) {
        return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }] };
      }
      return options.chat(request);
    },
  };
  return port;
}

function textResult(content: unknown): LlmChatResult {
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } as never }],
    usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
  };
}

describe('extraction du texte de réponse', () => {
  it('accepte une chaîne simple', () => {
    expect(contentToText('texte brut')).toBe('texte brut');
    expect(extractText(textResult('texte brut'))).toBe('texte brut');
  });

  it('concatène les blocs de type text', () => {
    const blocks: LlmTextPart[] = [
      { type: 'text', text: 'première phrase.' },
      { type: 'text', text: 'seconde phrase.' },
    ];
    expect(contentToText(blocks)).toBe('première phrase.\nseconde phrase.');
    expect(extractText(textResult(blocks))).toBe('première phrase.\nseconde phrase.');
  });

  it('ignore les blocs qui ne sont pas du texte', () => {
    const mixed = [
      { type: 'image', url: 'http://x/y.png' },
      { type: 'text', text: 'seul bloc utile' },
    ];
    expect(contentToText(mixed as never)).toBe('seul bloc utile');
  });

  it('rend une chaîne vide pour une réponse inexploitable', () => {
    expect(contentToText(undefined)).toBe('');
    expect(contentToText(null)).toBe('');
    expect(contentToText(42 as never)).toBe('');
    expect(extractText(undefined)).toBe('');
    expect(extractText({ choices: [] })).toBe('');
    expect(extractText({ choices: [{ finish_reason: 'stop' }] })).toBe('');
  });
});

describe('complete()', () => {
  beforeEach(() => {
    resetModelCache();
    // Les échecs sont journalisés, jamais levés : on coupe le bruit en test.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('rend le texte du modèle et n’envoie ni temperature ni top_p', async () => {
    const port = fakePort();
    const client = createLlmClient(port);
    const answer = await client.complete('système', 'utilisateur', 64);
    expect(answer).toBe('ok');
    const sent = port.requests[0];
    expect(sent.model).toBe('claude-haiku-4-5');
    expect(sent.max_completion_tokens).toBe(64);
    expect(sent.messages).toEqual([
      { role: 'system', content: 'système' },
      { role: 'user', content: 'utilisateur' },
    ]);
    expect('temperature' in sent).toBe(false);
    expect('top_p' in sent).toBe(false);
  });

  it('rend null quand le modèle est absent de la liste (repli déterministe puis échec)', async () => {
    const port = fakePort({
      models: [],
      chat: async () => {
        throw new Error(`modèle ${FALLBACK_MODEL} inconnu`);
      },
    });
    expect(await createLlmClient(port).complete('s', 'u', 32)).toBeNull();
    expect(port.requests[0].model).toBe(FALLBACK_MODEL);
  });

  it('rend null quand chat() lève une erreur', async () => {
    const port = fakePort({
      chat: async () => {
        throw new Error('FORGE_API_ERROR');
      },
    });
    expect(await createLlmClient(port).complete('s', 'u', 32)).toBeNull();
  });

  it('rend null quand list() échoue et que l’appel suivant échoue aussi', async () => {
    const port = fakePort({
      listError: new Error('runtime indisponible'),
      chat: async () => {
        throw new Error('pas de runtime');
      },
    });
    expect(await createLlmClient(port).complete('s', 'u', 32)).toBeNull();
  });

  it('rend null sur une réponse vide ou sans choix', async () => {
    const empty = fakePort({ chat: async () => ({ choices: [] }) });
    expect(await createLlmClient(empty).complete('s', 'u', 32)).toBeNull();
    const blank = fakePort({ chat: async () => textResult('   ') });
    expect(await createLlmClient(blank).complete('s', 'u', 32)).toBeNull();
  });

  it('rend null quand le modèle dépasse le délai imparti', async () => {
    const port = fakePort({
      chat: () => new Promise<LlmChatResult>((resolve) => setTimeout(() => resolve(textResult('trop tard')), 80)),
    });
    const client = createLlmClient(port, { timeoutMs: 5 });
    await expect(client.complete('s', 'u', 32)).resolves.toBeNull();
  });

  it('borne chaque appel au délai configuré (défaut : 8 s)', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(8_000);
    const port = fakePort();
    const client = createLlmClient(port, { timeoutMs: 1_000 });
    expect(await client.complete('s', 'u', 16)).toBe('ok');
  });
});

describe('diagnostic d’erreur', () => {
  it('expose le corps de réponse porté par err.context.responseText', () => {
    const error = Object.assign(new Error('FORGE_API_ERROR'), {
      context: { responseText: '{"message":"model not enabled"}' },
    });
    expect(describeLlmError(error)).toContain('model not enabled');
    expect(describeLlmError(new Error('panne simple'))).toBe('panne simple');
    expect(describeLlmError('brute')).toBe('brute');
  });
});
