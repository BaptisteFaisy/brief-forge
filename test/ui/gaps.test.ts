import { GapList } from '../../src/ui/components/GapList';
import { MOCK_READINESS_SCORE } from '../../src/ui/data';
import { findAll, textOf } from './renderTree';

describe('GapList — liste des manques', () => {
  it('liste chaque manque avec son critère, ses points perdus et sa raison', () => {
    const tree = GapList({ gaps: MOCK_READINESS_SCORE.gaps });
    const text = textOf(tree);

    expect(text).toContain('3 point(s) à préciser');
    for (const gap of MOCK_READINESS_SCORE.gaps) {
      expect(text).toContain(gap.criterion);
      expect(text).toContain(gap.reason);
      expect(text).toContain(`-${gap.pointsLost} pts`);
    }
  });

  it('somme les points perdus expliqués (30 + 10 + 15)', () => {
    const total = MOCK_READINESS_SCORE.gaps.reduce((sum, gap) => sum + gap.pointsLost, 0);
    expect(total).toBe(55);
    expect(100 - total).toBe(MOCK_READINESS_SCORE.score);
  });

  it('affiche un message de confirmation quand aucun manque ne subsiste', () => {
    const tree = GapList({ gaps: [] });
    const text = textOf(tree);
    const messages = findAll(tree, 'SectionMessage');

    expect(text).toContain('Aucun manque identifié');
    expect(messages[0].appearance).toBe('confirmation');
  });

  it('passe en anglais quand la langue vaut « en »', () => {
    const text = textOf(GapList({ gaps: MOCK_READINESS_SCORE.gaps, language: 'en' }));
    expect(text).toContain('gap(s) to clarify');
  });
});
