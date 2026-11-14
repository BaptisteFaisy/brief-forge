/**
 * Tests hors ligne du magasin de jetons (`scripts/lib/tokenStore.mjs`).
 *
 * Deux niveaux, parce que la rejouabilité des preuves `asUser` se joue là :
 * - les **règles pures** (harnais `.mjs`, car Jest ne transforme pas l'ESM) :
 *   ce qui est stocké, ce que « expiré » veut dire, quand un renouvellement
 *   est possible et pourquoi il ne l'est pas sinon ;
 * - les **portes d'entrée** des scripts, qui doivent écarter un jeton périmé
 *   **avant** tout appel réseau. Un 401 compris (« ton expiré, il manque le
 *   client_id ») n'est pas un 401 subi (« le chemin asUser est cassé ») :
 *   c'est l'erreur de diagnostic du 12 novembre, payée une journée.
 *
 * Aucun appel réseau, aucun jeton réel : les fichiers sont fabriqués dans un
 * répertoire temporaire hors du dépôt.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const LOGIN = join('scripts', 'mcp-login.mjs');
const E2E = join('scripts', 'mcp-e2e.mjs');
const HARNAIS = join('test', 'scripts', 'harnais-token-store.mjs');

const VALEURS_FAITES = ['AT13', 'RT13', 'ATY', 'RTY', 'CIDY'];

let dossier = '';

/** Écrit un fichier de jeton (hors dépôt) et rend son chemin. */
function jeterFeton(nom: string, jeton: Record<string, unknown>): string {
  const chemin = join(dossier, nom);
  writeFileSync(chemin, `${JSON.stringify(jeton, null, 1)}\n`, { mode: 0o600 });
  return chemin;
}

function run(script: string, args: string[]) {
  const result = spawnSync('node', [script, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, MCP_TOKEN: '' },
  });
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'bf-magasin-jetons-'));
});

afterAll(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe('magasin de jetons — règles pures', () => {
  test('le harnais valide le stockage, l’expiration et le renouvellement', () => {
    const { status, out } = run(HARNAIS, []);
    expect(out).toContain('client_id persisté -> true');
    expect(out).toContain('expire_a = obtenu + durée -> true');
    expect(out).toContain('reste 30 s < marge 120 s : expiré');
    expect(out).toContain('sans client_id : renouvellement impossible -> true');
    expect(out).toContain('non renouvelable : dit le consentement, jamais un faux --refresh -> true');
    expect(out).toContain('fichier écrit en 0600 -> true');
    expect(status).toBe(0);
  });
});

describe('mcp-login --refresh — refus motivé, hors ligne', () => {
  test('un jeton sans client_id est refusé en le nommant', () => {
    const chemin = jeterFeton('sans-client.json', {
      access_token: 'AT13',
      refresh_token: 'RT13',
      expires_in: 28800,
    });
    const { status, out } = run(LOGIN, ['--refresh', '--out', chemin]);
    expect(status).toBe(1);
    expect(out).toContain('client_id absent');
    expect(out).toContain('consentement doit être rejoué');
  });

  test('un fichier absent dit comment le créer', () => {
    const { status, out } = run(LOGIN, ['--refresh', '--out', join(dossier, 'introuvable.json')]);
    expect(status).toBe(1);
    expect(out).toContain('aucun jeton dans');
  });
});

describe('mcp-e2e — un jeton périmé n’atteint pas le serveur', () => {
  const passe = Math.floor(Date.now() / 1000);

  test('périmé et non renouvelable : code 2, étape humaine (consentement)', () => {
    const chemin = jeterFeton('perime-sans-client.json', {
      access_token: 'AT13',
      refresh_token: 'RT13',
      obtenu_a: passe - 9 * 3600,
      expire_a: passe - 3600,
    });
    const { status, out } = run(E2E, ['--run', '--issue', 'PAY-220', '--token-file', chemin]);
    expect(status).toBe(2);
    expect(out).toContain('BLOQUÉ — une étape humaine est requise');
    expect(out).toContain('client_id absent');
  });

  test('périmé mais renouvelable : code 1 et la commande exacte', () => {
    const chemin = jeterFeton('perime-avec-client.json', {
      access_token: 'ATY',
      refresh_token: 'RTY',
      client_id: 'CIDY',
      obtenu_a: passe - 9 * 3600,
      expire_a: passe - 3600,
    });
    const { status, out } = run(E2E, ['--run', '--issue', 'PAY-220', '--token-file', chemin]);
    expect(status).toBe(1);
    expect(out).toContain('node scripts/mcp-login.mjs --refresh');
  });

  test('aucune de ces sorties ne contient une valeur de jeton', () => {
    // Cas non renouvelable : les deux scripts s'arrêtent avant tout appel
    // réseau, ce qui rend l'assertion possible hors ligne (la CI n'a ni jeton,
    // ni garantie de réseau).
    const chemin = jeterFeton('fuites.json', {
      access_token: 'AT13',
      refresh_token: 'RT13',
      obtenu_a: passe - 9 * 3600,
      expire_a: passe - 3600,
    });
    const { out } = run(E2E, ['--run', '--issue', 'PAY-220', '--token-file', chemin]);
    const { out: outLogin } = run(LOGIN, ['--refresh', '--out', chemin]);
    for (const valeur of VALEURS_FAITES) {
      expect(out.includes(valeur)).toBe(false);
      expect(outLogin.includes(valeur)).toBe(false);
    }
  });
});
