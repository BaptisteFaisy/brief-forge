/**
 * Tests hors ligne du protocole MCP de bout en bout (`scripts/mcp-e2e.mjs`).
 *
 * Aucun appel réseau : on n'exécute que les modes qui se satisfont du dépôt
 * (`--selftest`, `--help`) et les garde-fous d'argumentaire (jeton refusé en
 * argument, mode bloqué sans jeton). La découverte `.well-known` et les modes
 * avec jeton sont documentés dans `docs/MCP-E2E.md` et se jouent à la main.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join('scripts', 'mcp-e2e.mjs');
const LIB_DIR = join('scripts', 'lib');
const LIBS = ['http.mjs', 'output.mjs', 'mcpClient.mjs', 'manifestTools.mjs', 'briefChecks.mjs'];

/** Lance le script avec un environnement privé de tout jeton. */
function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, MCP_TOKEN: '', ...env },
  });
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('scripts MCP E2E — intégrité', () => {
  test.each([SCRIPT, ...LIBS.map((lib) => join(LIB_DIR, lib))])(
    '%s a une syntaxe valide (node --check)',
    (file) => {
      const check = spawnSync('node', ['--check', file], { cwd: ROOT, encoding: 'utf-8' });
      expect(check.status).toBe(0);
    }
  );

  test.each([SCRIPT, ...LIBS.map((lib) => join(LIB_DIR, lib))])(
    '%s reste sous la limite de 500 lignes',
    (file) => {
      const lines = readFileSync(join(ROOT, file), 'utf-8').split('\n').length;
      expect(lines).toBeLessThan(500);
    }
  );

  test('aucun motif de secret en clair dans les scripts', () => {
    const files = [SCRIPT, ...LIBS.map((lib) => join(LIB_DIR, lib))];
    const forbidden = [/ghp_[A-Za-z0-9]{36}/, /sk-[A-Za-z0-9_-]{24,}/, /sk_[a-f0-9]{32}/];
    for (const file of files) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      for (const pattern of forbidden) expect(content).not.toMatch(pattern);
    }
  });
});

describe('scripts MCP E2E — modes hors ligne', () => {
  test('--help s\'imprime et sort à 0', () => {
    const { status, out } = run(['--help']);
    expect(status).toBe(0);
    expect(out).toContain('--discovery');
    expect(out).toContain('Codes de sortie');
  });

  test('--selftest lit les 11 outils du manifeste et valide le comparateur', () => {
    const { status, out } = run(['--selftest']);
    expect(status).toBe(0);
    expect(out).toContain('11 actions lues, 11 outils dans le module rovo:mcp');
    expect(out).toContain('11 outils exposés, comme le contrat l’exige');
    expect(out).toContain('liste abîmée : 2 écart(s) détecté(s)');
    for (const tool of [
      'get-work-brief',
      'check-readiness',
      'get-acceptance-criteria',
      'get-related-decisions',
      'get-failed-attempts',
      'get-neighbor-changes',
      'list-ready-work',
      'ask-clarification',
      'post-work-report',
      'record-failed-attempt',
      'claim-work',
    ]) {
      expect(out).toContain(tool);
    }
  });

  test('sans jeton, --check s\'arrête sur l\'étape humaine (code 2)', () => {
    const { status, out } = run(['--check']);
    expect(status).toBe(2);
    expect(out).toContain('BLOQUÉ — une étape humaine est requise');
    expect(out).toContain('Connected apps');
  });

  test('sans jeton, --run s\'arrête aussi sur l\'étape humaine (code 2)', () => {
    const { status } = run(['--run', '--issue', 'PAY-123']);
    expect(status).toBe(2);
  });

  test('un jeton passé en argument est refusé (code 1)', () => {
    const { status, out } = run(['--check', '--token', 'peu-importe']);
    expect(status).toBe(1);
    expect(out).toContain('un jeton ne se passe jamais en argument');
  });

  test('une option inconnue est refusée (code 1)', () => {
    const { status, out } = run(['--n-importe-quoi']);
    expect(status).toBe(1);
    expect(out).toContain('option inconnue');
  });
});
