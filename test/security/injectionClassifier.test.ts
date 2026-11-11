/**
 * Contrôle par modèle (BC-10, étage optionnel).
 * Exigences testées : aucun crash sans modèle, repli sur les règles, et
 * « pas de verdict » ⇒ on retire par défaut.
 */
import {
  buildClassifierPrompt,
  classifyInstruction,
  detectInstructionViaModel,
  isInstructionVerdict,
  isModelClassifierAvailable,
  parseModelAnswer,
  registerModelBridge,
} from '../../src/security/injectionClassifier';

afterEach(() => {
  registerModelBridge(null);
});

describe('parseModelAnswer', () => {
  it('reconnaît un verdict d’instruction', () => {
    expect(parseModelAnswer('INSTRUCTION')).toBe('instruction');
    expect(parseModelAnswer('  instruction  ')).toBe('instruction');
    expect(parseModelAnswer('Oui, c’est une instruction pour l’agent')).toBe('instruction');
  });

  it('reconnaît un verdict de donnée', () => {
    expect(parseModelAnswer('DONNEE')).toBe('donnee');
    expect(parseModelAnswer('donnée')).toBe('donnee');
    expect(parseModelAnswer('Aucune instruction ici, c’est une donnée')).toBe('donnee');
  });

  it('rend « inconnu » sur une réponse inexploitable', () => {
    expect(parseModelAnswer('')).toBe('inconnu');
    expect(parseModelAnswer('peut-être')).toBe('inconnu');
    expect(parseModelAnswer('42')).toBe('inconnu');
  });
});

describe('isInstructionVerdict — règle unique du repli sûr', () => {
  it('traite l’absence de verdict comme une instruction', () => {
    expect(isInstructionVerdict('instruction')).toBe(true);
    expect(isInstructionVerdict('inconnu')).toBe(true);
  });

  it('ne retire que sur un verdict bénin explicite', () => {
    expect(isInstructionVerdict('donnee')).toBe(false);
  });
});

describe('classifyInstruction — pannes absorbées', () => {
  it('rend « inconnu » quand le modèle lève une erreur', async () => {
    const verdict = await classifyInstruction('texte', {
      callModel: async () => {
        throw new Error('modèle indisponible');
      },
    });
    expect(verdict).toBe('inconnu');
  });

  it('rend « inconnu » quand le modèle dépasse le délai', async () => {
    const verdict = await classifyInstruction('texte', {
      timeoutMs: 10,
      callModel: () => new Promise<string>((resolve) => setTimeout(() => resolve('DONNEE'), 200)),
    });
    expect(verdict).toBe('inconnu');
  });

  it('rend « inconnu » quand aucune réponse n’est exploitable', async () => {
    const verdict = await classifyInstruction('texte', { callModel: async () => '   ' });
    expect(verdict).toBe('inconnu');
  });

  it('transmet le verdict du modèle quand il répond', async () => {
    await expect(
      classifyInstruction('texte', { callModel: async () => 'DONNEE' })
    ).resolves.toBe('donnee');
    await expect(
      classifyInstruction('texte', { callModel: async () => 'INSTRUCTION' })
    ).resolves.toBe('instruction');
  });

  it('considère un texte vide comme bénin (rien à classer)', async () => {
    await expect(classifyInstruction('   ')).resolves.toBe('donnee');
  });
});

describe('detectInstructionViaModel — contrat § 4.5', () => {
  it('renvoie true quand le modèle voit une instruction', async () => {
    await expect(
      detectInstructionViaModel('texte', { callModel: async () => 'INSTRUCTION' })
    ).resolves.toBe(true);
  });

  it('renvoie false quand le modèle déclare une donnée', async () => {
    await expect(
      detectInstructionViaModel('texte', { callModel: async () => 'DONNEE' })
    ).resolves.toBe(false);
  });

  it('renvoie true (on retire) quand il n’y a pas de verdict', async () => {
    await expect(
      detectInstructionViaModel('texte', { callModel: async () => 'aucune idée' })
    ).resolves.toBe(true);
  });

  it('renvoie true quand le modèle est en panne', async () => {
    await expect(
      detectInstructionViaModel('texte', {
        callModel: async () => {
          throw new Error('panne');
        },
      })
    ).resolves.toBe(true);
  });
});

describe('disponibilité du modèle', () => {
  it('n’est pas disponible sans pont ni capacité Forge', () => {
    expect(isModelClassifierAvailable()).toBe(false);
  });

  it('devient disponible dès qu’un pont est enregistré', () => {
    registerModelBridge(async () => 'DONNEE');
    expect(isModelClassifierAvailable()).toBe(true);
  });

  it('redevient indisponible quand le pont est retiré', () => {
    registerModelBridge(async () => 'DONNEE');
    registerModelBridge(null);
    expect(isModelClassifierAvailable()).toBe(false);
  });

  it('utilise le pont enregistré quand aucun modèle n’est injecté', async () => {
    registerModelBridge(async () => 'INSTRUCTION');
    await expect(classifyInstruction('texte')).resolves.toBe('instruction');
  });
});

describe('buildClassifierPrompt', () => {
  it('délimite le texte tiers et impose une réponse courte', () => {
    const prompt = buildClassifierPrompt('contenu tiers');
    expect(prompt).toContain('<<<DEBUT TEXTE TIERS>>>');
    expect(prompt).toContain('contenu tiers');
    expect(prompt).toContain('INSTRUCTION');
    expect(prompt).toContain('DONNEE');
  });

  it('borne la taille du texte envoyé au modèle', () => {
    const prompt = buildClassifierPrompt('x'.repeat(10_000));
    expect(prompt.length).toBeLessThan(6_000);
  });
});
