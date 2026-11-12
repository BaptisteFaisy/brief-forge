/**
 * Garde du paquet de preuves.
 *
 * Un artefact sans provenance n'est pas une preuve, et une preuve sans limite
 * déclarée est une promesse. Ce test refuse en CI :
 * - un artefact sans en-tête de provenance ;
 * - une étape sans README, ou dont le README ne dit pas ce qu'elle ne prouve
 *   pas ;
 * - une preuve contenant un motif de secret ;
 * - une étape absente de l'index de son paquet ;
 * - un item de la liste des dix sans ligne de preuve.
 *
 * Structure : `docs/evidence/<paquet>/<étape>/<artefact>`. La convention est
 * décrite dans `docs/PREUVES.md`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Le test est dans `test/` : un seul niveau à remonter pour la racine.
const RACINE = join(__dirname, '..');
const PREUVES = join(RACINE, 'docs', 'evidence');

const MOTIFS_SECRET =
  /(ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9_-]{24,}|sk_[a-f0-9]{32}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY)/;

/** Les dix items du cahier des charges, dans l'ordre. */
const ITEMS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
];

function sousDossiers(base: string): string[] {
  return readdirSync(base).filter((nom) => statSync(join(base, nom)).isDirectory());
}

function fichiers(base: string): string[] {
  return readdirSync(base).filter((nom) => statSync(join(base, nom)).isFile());
}

describe('paquet de preuves', () => {
  const paquets = sousDossiers(PREUVES);

  it('l’index général existe et cite chaque paquet', () => {
    const index = join(PREUVES, 'README.md');
    expect(existsSync(index)).toBe(true);
    const texte = readFileSync(index, 'utf8');
    for (const paquet of paquets) {
      expect({ paquet, cite: texte.includes(paquet) }).toEqual({ paquet, cite: true });
    }
  });

  it('chaque paquet a un index', () => {
    expect(paquets.length).toBeGreaterThan(0);
    for (const paquet of paquets) {
      const index = join(PREUVES, paquet, 'README.md');
      expect({ paquet, existe: existsSync(index) }).toEqual({ paquet, existe: true });
      expect({
        paquet,
        regles: readFileSync(index, 'utf8').includes('## Règles de ce paquet'),
      }).toEqual({ paquet, regles: true });
    }
  });

  it('chaque étape a un README qui dit ce qu’elle prouve et ce qu’elle ne prouve pas', () => {
    for (const paquet of paquets) {
      for (const etape of sousDossiers(join(PREUVES, paquet))) {
        const readme = join(PREUVES, paquet, etape, 'README.md');
        expect({ etape, existe: existsSync(readme) }).toEqual({ etape, existe: true });
        const texte = readFileSync(readme, 'utf8');
        expect({ etape, prouve: texte.includes('## Ce que ça prouve') }).toEqual({
          etape,
          prouve: true,
        });
        expect({ etape, limites: texte.includes('## Ce que ça ne prouve pas') }).toEqual({
          etape,
          limites: true,
        });
      }
    }
  });

  it('chaque artefact porte un en-tête de provenance', () => {
    for (const paquet of paquets) {
      for (const etape of sousDossiers(join(PREUVES, paquet))) {
        const dossier = join(PREUVES, paquet, etape);
        for (const nom of fichiers(dossier)) {
          if (nom === 'README.md') continue;
          const texte = readFileSync(join(dossier, nom), 'utf8');
          // Un artefact JSON reste du JSON : sa provenance est une clé, pas un
          // en-tête qui précéderait la donnée.
          const provenance = nom.endsWith('.json')
            ? Boolean(JSON.parse(texte).provenance)
            : texte.startsWith('# Provenance');
          expect({ etape, nom, provenance }).toEqual({ etape, nom, provenance: true });
        }
      }
    }
  });

  it('aucune preuve ne contient de motif de secret', () => {
    for (const paquet of paquets) {
      for (const etape of sousDossiers(join(PREUVES, paquet))) {
        const dossier = join(PREUVES, paquet, etape);
        for (const nom of fichiers(dossier)) {
          const texte = readFileSync(join(dossier, nom), 'utf8');
          expect({ etape, nom, secret: MOTIFS_SECRET.test(texte) }).toEqual({
            etape,
            nom,
            secret: false,
          });
        }
      }
    }
  });

  it('chaque étape est référencée dans l’index de son paquet', () => {
    for (const paquet of paquets) {
      const index = readFileSync(join(PREUVES, paquet, 'README.md'), 'utf8');
      for (const etape of sousDossiers(join(PREUVES, paquet))) {
        expect({ etape, indexee: index.includes(etape) }).toEqual({ etape, indexee: true });
      }
    }
  });

  it('les dix items ont chacun une ligne de preuve', () => {
    const table = join(PREUVES, '2026-11-12', 'items-01-10.md');
    expect(existsSync(table)).toBe(true);
    const texte = readFileSync(table, 'utf8');
    for (const item of ITEMS) {
      const ligne = texte.split('\n').find((l) => l.startsWith(`| ${item} `));
      expect({ item, presente: Boolean(ligne) }).toEqual({ item, presente: true });
      // Une ligne de preuve cite une PR : sans elle, l'item n'est qu'une
      // affirmation.
      expect({ item, citeUnePR: Boolean(ligne && /#[0-9]+/.test(ligne)) }).toEqual({
        item,
        citeUnePR: true,
      });
    }
  });

  it('la capture des preuves est rejouable', () => {
    expect(existsSync(join(RACINE, 'scripts', 'capturer-preuves.sh'))).toBe(true);
  });
});
