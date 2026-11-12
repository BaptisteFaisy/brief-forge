jest.mock('@forge/react', () => require('./forgeReactMock').forgeReactMock);

import {
  ConnectHelp,
  IssueContext,
  ProjectPage,
  ProjectSettingsPage,
} from '../../src/ui';
import {
  MOCK_ATTEMPTS,
  MOCK_BRIEF_DATA,
  MOCK_PROJECT_ISSUES,
  MOCK_PROJECT_METRICS,
  MOCK_PROJECT_SETTINGS,
  MOCK_READINESS_SCORE,
} from '../../src/ui/data';
import { clientCommands, mcpServerUrl, renderConnectHelp } from '../../src/ui/ConnectHelp';
import { renderIssueContext } from '../../src/ui/IssueContext';
import { renderProjectPage } from '../../src/ui/ProjectPage';
import { renderProjectSettingsPage, staticSettingsForm } from '../../src/ui/ProjectSettingsPage';
import { initialIssueContextView, openBrief } from '../../src/ui/state';
import type { ProjectSettingsView } from '../../src/ui/state';
import { findAll, textOf } from './renderTree';

const noop = () => undefined;

const issueContextHandlers = {
  onToggleLanguage: noop,
  onOpenBrief: noop,
  onCloseBrief: noop,
  onConfirm: noop,
  onCorrect: noop,
};

describe('Écran jira:issueContext', () => {
  const props = {
    issueKey: 'PROJ-128',
    readiness: MOCK_READINESS_SCORE,
    brief: MOCK_BRIEF_DATA,
    attempts: MOCK_ATTEMPTS,
  };

  it('expose le module jira:issueContext', () => {
    expect(typeof IssueContext).toBe('function');
  });

  it('affiche le score, les manques et le bouton « Voir le brief »', () => {
    const text = textOf(renderIssueContextPure(props));

    expect(text).toContain('Préparation : 45 / 100');
    expect(text).toContain('point(s) à préciser');
    expect(text).toContain('Voir le brief');
    expect(text).toContain('Historique des tentatives');
  });

  it('n\'ouvre le brief qu\'à la demande, puis affiche le markdown exact de l\'agent', () => {
    const closed = renderIssueContextPure(props);
    const opened = renderIssueContextPure(props, openBrief(initialIssueContextView(MOCK_ATTEMPTS)));

    expect(findAll(closed, 'Modal')).toHaveLength(0);
    expect(findAll(opened, 'Modal')).toHaveLength(1);
    expect(findAll(opened, 'ModalTitle')).toHaveLength(1);
    expect(findAll(opened, 'CodeBlock')[0].text).toBe(MOCK_BRIEF_DATA.markdown);
    expect(textOf(opened)).toContain('## 1. Objectif');
  });

  it('affiche l\'avertissement quand le dernier compte rendu n\'a pas de tests', () => {
    const tree = renderIssueContextPure(props);

    expect(textOf(tree)).toContain('n\'a pas été vérifié par des tests');
    expect(textOf(tree)).toContain('non vérifié par des tests');
    expect(findAll(tree, 'SectionMessage').some((m) => m.title === 'non vérifié par des tests')).toBe(true);
  });

  it('passe en anglais via la bascule', () => {
    const text = textOf(renderIssueContextPure({ ...props, language: 'en' }));
    expect(text).toContain('Readiness: 45 / 100');
    expect(text).toContain('View brief');
  });
});

function renderIssueContextPure(
  props: Parameters<typeof IssueContext>[0],
  view = initialIssueContextView(props.attempts, props.language)
) {
  return renderIssueContext(props, view, issueContextHandlers);
}

describe('Écran jira:projectSettingsPage', () => {
  const props = { projectKey: 'PROJ', settings: MOCK_PROJECT_SETTINGS };

  function pure(view: ProjectSettingsView = { language: 'fr', saved: false }) {
    return renderProjectSettingsPage(
      props,
      view,
      { onToggleLanguage: noop, onSubmit: noop },
      staticSettingsForm(props.settings)
    );
  }

  it('expose le module jira:projectSettingsPage', () => {
    expect(typeof ProjectSettingsPage).toBe('function');
  });

  it('rend les quatre réglages du projet', () => {
    const tree = pure();
    const fields = findAll(tree, 'Textfield').map((field) => field.name);
    const areas = findAll(tree, 'TextArea').map((field) => field.name);

    expect(fields).toEqual(['acceptanceCriteriaField', 'triggerStatus', 'decisionLabels']);
    expect(areas).toEqual(['constraintsText']);
  });

  it('étiquette chaque champ et l\'accompagne de son aide', () => {
    const tree = pure();
    const labels = findAll(tree, 'Label').map((label) => label.children);
    const helpers = findAll(tree, 'HelperMessage').map((helper) => helper.children);

    expect(labels).toContain('Champ des critères d\'acceptation');
    expect(labels).toContain('Étiquettes Confluence qui valent décision');
    expect(helpers).toContain('Une contrainte par ligne ; elles sont ajoutées à chaque brief.');
    expect(labels).toHaveLength(4);
    expect(helpers).toHaveLength(4);
  });

  it('pré-remplit les valeurs enregistrées', () => {
    const tree = pure();
    const values = [...findAll(tree, 'Textfield'), ...findAll(tree, 'TextArea')]
      .map((field) => field.defaultValue);

    expect(values).toContain('customfield_10034');
    expect(values).toContain('Ready for Agent');
    expect(values).toContain('architecture-decision, adr, sec-review');
  });

  it('propose un bouton d\'enregistrement de type submit', () => {
    const buttons = findAll(pure(), 'Button');
    const submit = buttons.find((button) => button.type === 'submit');

    expect(submit?.children).toBe('Enregistrer');
    expect(submit?.appearance).toBe('primary');
  });

  it('confirme l\'enregistrement', () => {
    const text = textOf(pure({ language: 'fr', saved: true }));
    expect(text).toContain('Réglages enregistrés');
  });

  it('bascule les libellés en anglais', () => {
    const text = textOf(pure({ language: 'en', saved: false }));
    expect(text).toContain('brief-forge settings — PROJ');
    expect(text).toContain('Acceptance criteria field');
  });
});

describe('Écran jira:projectPage « Travail des agents »', () => {
  const props = { projectKey: 'PROJ', issues: MOCK_PROJECT_ISSUES, metrics: MOCK_PROJECT_METRICS };

  it('expose le module jira:projectPage', () => {
    expect(typeof ProjectPage).toBe('function');
  });

  it('répartit les tickets en prêts, en cours et rendus', () => {
    const text = textOf(renderProjectPagePure(props));

    expect(text).toContain('Tickets prêts');
    expect(text).toContain('En cours');
    expect(text).toContain('Rendus');
    expect(text).toContain('PROJ-130');
    expect(text).toContain('PROJ-128');
    expect(text).toContain('PROJ-124');
  });

  it('affiche les indicateurs du projet', () => {
    const text = textOf(renderProjectPagePure(props));

    expect(text).toContain('Comptes rendus confirmés sans correction');
    expect(text).toContain('82 %');
    expect(text).toContain('Clarifications demandées plutôt que devinées');
    expect(text).toContain('94 %');
    expect(text).toContain('Tentatives répétées évitées');
    expect(text).toContain('16');
  });

  it('affiche « — données insuffisantes » plutôt qu’un 0 % inventé', () => {
    const text = textOf(renderProjectPagePure({
      ...props,
      metrics: {
        ...MOCK_PROJECT_METRICS,
        confirmedWithoutCorrectionRate: null,
        clarificationsAskedVsGuessedRate: null,
      },
    }));

    expect(text).toContain('— données insuffisantes');
    expect(text).not.toContain('0 %');
  });

  it('en anglais, le manque de données est dit en anglais', () => {
    // `renderProjectPagePure` fige la vue en français : on rend directement avec
    // une vue anglaise pour exercer la langue de l'écran.
    const text = textOf(renderProjectPage(
      {
        ...props,
        metrics: { ...MOCK_PROJECT_METRICS, confirmedWithoutCorrectionRate: null },
      },
      { language: 'en' },
      { onToggleLanguage: noop }
    ));

    expect(text).toContain('— insufficient data');
    expect(text).toContain('Reports confirmed without correction');
  });

  it('légende chaque taux par son dénominateur réel, pas par une fenêtre inventée', () => {
    const text = textOf(renderProjectPagePure({
      ...props,
      metricsDetail: {
        confirmedWithoutCorrection: { denominator: 12, insufficientData: false },
        clarificationsAskedVsGuessed: { denominator: 7, insufficientData: false },
        repeatedAttemptsAvoided: { denominator: 40, insufficientData: false },
      },
    }));

    expect(text).toContain('sur 12 comptes rendus relus');
    expect(text).toContain('sur 7 incertitudes');
    expect(text).toContain('sur 40 tickets dont le brief a été servi');
    expect(text).not.toContain('30 derniers jours');
  });

  it('sans détail du résolveur, aucune légende n’est inventée', () => {
    const text = textOf(renderProjectPagePure(props));

    expect(text).not.toContain('comptes rendus relus');
    expect(text).not.toContain('30 derniers jours');
  });

  it('liste les manques les plus fréquents, triés par fréquence', () => {
    const text = textOf(renderProjectPagePure(props));
    const counts = MOCK_PROJECT_METRICS.topGaps.map((gap) => gap.count);

    expect(text).toContain('Manques les plus fréquents du projet');
    expect(text).toContain('18 ticket(s)');
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('signale les rendus déposés sans tests', () => {
    expect(textOf(renderProjectPagePure(props))).toContain('non vérifié par des tests');
  });

  it('colore la lozenge de statut de chaque ticket', () => {
    const lozenges = findAll(renderProjectPagePure(props), 'Lozenge').map((l) => l.appearance);

    expect(lozenges).toContain('new');
    expect(lozenges).toContain('inprogress');
    expect(lozenges).toContain('success');
  });
});

function renderProjectPagePure(props: Parameters<typeof ProjectPage>[0]) {
  return renderProjectPage(props, { language: 'fr' }, { onToggleLanguage: noop });
}

describe('Page d\'aide à la connexion', () => {
  it('compose l\'adresse MCP du serveur Forge', () => {
    expect(mcpServerUrl('abc-123')).toBe('https://mcp.atlassian.com/forge/abc-123');
  });

  it('fournit une commande par client MCP, avec l\'adresse complète', () => {
    const commands = clientCommands('abc-123');

    expect(commands.map((entry) => entry.client)).toEqual(['[CC] (CLI)', 'Cursor', 'VS Code']);
    for (const entry of commands) {
      expect(entry.command).toContain('https://mcp.atlassian.com/forge/abc-123');
    }
  });

  it('affiche l\'adresse, la marche à suivre administrateur et les commandes', () => {
    const text = textOf(renderConnectHelpPure({ appId: 'abc-123' }));

    expect(text).toContain('https://mcp.atlassian.com/forge/abc-123');
    expect(text).toContain('Marche à suivre pour l\'administrateur');
    expect(text).toContain('claude mcp add --transport http brief-forge');
    expect(text).toContain('Commande à copier, par client MCP');
  });

  it('numérote les quatre étapes administrateur', () => {
    const text = textOf(renderConnectHelpPure({ appId: 'abc-123' }));

    for (const step of ['1.', '2.', '3.', '4.']) expect(text).toContain(step);
    expect(text).toContain('rovo:mcp');
  });

  it('expose le module d\'aide connexion', () => {
    expect(typeof ConnectHelp).toBe('function');
  });
});

function renderConnectHelpPure(props: Parameters<typeof ConnectHelp>[0]) {
  return renderConnectHelp(props, { language: 'fr' }, { onToggleLanguage: noop });
}
