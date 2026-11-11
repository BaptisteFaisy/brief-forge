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
import { renderProjectSettingsPage } from '../../src/ui/ProjectSettingsPage';
import { initialIssueContextView, openBrief } from '../../src/ui/state';
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

  it('n\'ouvre le brief qu\'à la demande, puis affiche le markdown de l\'agent', () => {
    const closed = renderIssueContextPure(props);
    const opened = renderIssueContextPure(props, openBrief(initialIssueContextView(MOCK_ATTEMPTS)));

    expect(findAll(closed, 'ModalDialog')).toHaveLength(0);
    expect(findAll(opened, 'ModalDialog')).toHaveLength(1);
    expect(textOf(opened)).toContain('## 1. Objectif');
  });

  it('affiche l\'avertissement quand le dernier compte rendu n\'a pas de tests', () => {
    expect(textOf(renderIssueContextPure(props))).toContain('n\'a pas été vérifié par des tests');
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

  it('expose le module jira:projectSettingsPage', () => {
    expect(typeof ProjectSettingsPage).toBe('function');
  });

  it('rend les quatre réglages du projet', () => {
    const tree = renderProjectSettingsPure(props);
    const fields = findAll(tree, 'TextField').map((field) => field.name);
    const areas = findAll(tree, 'TextArea').map((field) => field.name);

    expect(fields).toEqual(['acceptanceCriteriaField', 'triggerStatus', 'decisionLabels']);
    expect(areas).toEqual(['constraintsText']);
  });

  it('pré-remplit les valeurs enregistrées', () => {
    const tree = renderProjectSettingsPure(props);
    const values = [...findAll(tree, 'TextField'), ...findAll(tree, 'TextArea')]
      .map((field) => field.defaultValue);

    expect(values).toContain('customfield_10034');
    expect(values).toContain('Ready for Agent');
    expect(values).toContain('architecture-decision, adr, sec-review');
  });

  it('confirme l\'enregistrement', () => {
    const text = textOf(
      renderProjectSettingsPure(props, { language: 'fr', saved: true })
    );
    expect(text).toContain('Réglages enregistrés');
  });
});

function renderProjectSettingsPure(
  props: Parameters<typeof ProjectSettingsPage>[0],
  view = { language: props.language ?? ('fr' as const), saved: false }
) {
  return renderProjectSettingsPage(props, view, { onToggleLanguage: noop, onSubmit: noop });
}

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

  it('expose le module d\'aide connexion', () => {
    expect(typeof ConnectHelp).toBe('function');
  });
});

function renderConnectHelpPure(props: Parameters<typeof ConnectHelp>[0]) {
  return renderConnectHelp(props, { language: 'fr' }, { onToggleLanguage: noop });
}
