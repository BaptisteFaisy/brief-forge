jest.mock('@forge/react', () => require('./forgeReactMock').forgeReactMock);

import { AttemptHistory } from '../../src/ui/components/AttemptHistory';
import { MOCK_ATTEMPTS, UIAttemptItem } from '../../src/ui/data';
import { ConfirmButtons } from '../../src/ui/components/ConfirmButtons';
import { confirmAttempt, latestAttempt, requestCorrection, sortAttempts } from '../../src/ui/state';
import { findAll, textOf } from './renderTree';

const ATTEMPTS: UIAttemptItem[] = sortAttempts(MOCK_ATTEMPTS);
const LATEST = latestAttempt(MOCK_ATTEMPTS) as UIAttemptItem;

/** Libellé d'un bouton UI Kit 2 : le texte est dans `children`, plus dans `text`. */
function buttonLabels(tree: unknown): string[] {
  return findAll(tree, 'Button').map((button) => String(button.children));
}

describe('Confirmation du dernier compte rendu', () => {
  it('désigne la tentative la plus récente comme dernier compte rendu', () => {
    expect(LATEST.id).toBe('att-002');
  });

  it('propose Confirmer et Corriger sur le dernier compte rendu seulement', () => {
    const tree = AttemptHistory({ attempts: ATTEMPTS, latestId: LATEST.id, onConfirm: () => undefined, onCorrect: () => undefined });

    expect(buttonLabels(tree)).toEqual(['Confirmer', 'Corriger']);
  });

  it('ne propose aucun bouton sans dernier compte rendu désigné', () => {
    const tree = AttemptHistory({ attempts: ATTEMPTS });
    expect(findAll(tree, 'Button')).toHaveLength(0);
  });

  it('confirme le compte rendu : état confirmed, correction annulée', () => {
    const after = confirmAttempt(ATTEMPTS, LATEST.id);
    const confirmed = after.find((attempt) => attempt.id === LATEST.id) as UIAttemptItem;

    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.correctionRequested).toBe(false);
    expect(textOf(ConfirmButtons({ attempt: confirmed, onConfirm: () => undefined, onCorrect: () => undefined })))
      .toContain('Compte rendu confirmé');
  });

  it('demande une correction : état correctionRequested, confirmation annulée', () => {
    const after = requestCorrection(confirmAttempt(ATTEMPTS, LATEST.id), LATEST.id);
    const corrected = after.find((attempt) => attempt.id === LATEST.id) as UIAttemptItem;

    expect(corrected.correctionRequested).toBe(true);
    expect(corrected.confirmed).toBe(false);
    expect(textOf(ConfirmButtons({ attempt: corrected, onConfirm: () => undefined, onCorrect: () => undefined })))
      .toContain('Correction demandée');
  });

  it('désactive le bouton déjà joué (isDisabled, UI Kit 2)', () => {
    const confirmed = confirmAttempt(ATTEMPTS, LATEST.id).find((a) => a.id === LATEST.id) as UIAttemptItem;
    const buttons = findAll(
      ConfirmButtons({ attempt: confirmed, onConfirm: () => undefined, onCorrect: () => undefined }),
      'Button'
    );

    expect(buttons[0].isDisabled).toBe(true);
    expect(buttons[1].isDisabled).toBeFalsy();
  });

  it('transmet l\'identifiant de la tentative au gestionnaire de clic', () => {
    const received: string[] = [];
    const tree = ConfirmButtons({
      attempt: LATEST,
      onConfirm: (id) => received.push(`confirm:${id}`),
      onCorrect: (id) => received.push(`correct:${id}`),
    });
    const buttons = findAll(tree, 'Button');

    (buttons[0].onClick as () => void)();
    (buttons[1].onClick as () => void)();

    expect(received).toEqual(['confirm:att-002', 'correct:att-002']);
  });

  it('signale « non vérifié par des tests » pour un compte rendu sans tests', () => {
    const tree = AttemptHistory({ attempts: [LATEST] });
    const badges = findAll(tree, 'Badge');

    expect(textOf(tree)).toContain('non vérifié par des tests');
    expect(badges[0].appearance).toBe('important');
  });

  it('signale « vérifié par des tests » quand des tests ont tourné', () => {
    const withTests = ATTEMPTS.filter((attempt) => attempt.hasTests);
    const tree = AttemptHistory({ attempts: withTests });

    expect(textOf(tree)).toContain('vérifié par des tests');
    expect(findAll(tree, 'Badge')[0].appearance).toBe('added');
  });
});
