/**
 * Rendu réel du point d'entrée sous React 18.
 *
 * `@forge/react` et `@forge/bridge` sont doublés (le paquet réel exige le pont
 * Custom UI d'Atlassian), mais React, ses hooks et le réconciliateur de test
 * sont les vrais : ce test prouve que l'arbre se construit, que `useEffect` +
 * `invoke` alimentent chaque écran, et que l'aiguillage par module fonctionne.
 */
jest.mock('@forge/react', () => require('./forgeReactMock').forgeReactMock);
jest.mock('@forge/bridge', () => ({ invoke: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { invoke } from '@forge/bridge';
import {
  MOCK_ATTEMPTS,
  MOCK_BRIEF_DATA,
  MOCK_PROJECT_ISSUES,
  MOCK_PROJECT_METRICS,
  MOCK_PROJECT_SETTINGS,
  MOCK_READINESS_SCORE,
} from '../../src/ui/data';
import { stubState } from './forgeReactMock';
import { findAll, textOf } from './renderTree';

// L'arbre rendu par `ForgeReconciler.render(...)` au chargement du module.
import '../../src/ui/frontend';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Ce que le résolveur renvoie, action par action. */
const PAYLOADS: Record<string, unknown> = {
  getIssueContext: {
    readiness: MOCK_READINESS_SCORE,
    briefMarkdown: MOCK_BRIEF_DATA.markdown,
    attempts: MOCK_ATTEMPTS,
  },
  getProjectPage: { issues: MOCK_PROJECT_ISSUES, metrics: MOCK_PROJECT_METRICS },
  getProjectSettings: { settings: MOCK_PROJECT_SETTINGS },
};

/** Monte l'écran aiguillé par `extension`, résolveur simulé, effets purgés. */
async function renderScreen(extension: Record<string, unknown>, appId = 'abc-123') {
  stubState.productContext = { appId, extension };
  (invoke as unknown as jest.Mock).mockImplementation((action: string) =>
    Promise.resolve(PAYLOADS[action] ?? null)
  );

  const holder: { current?: ReactTestRenderer } = {};
  await act(async () => {
    holder.current = create(stubState.rendered as React.ReactElement);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return holder.current as ReactTestRenderer;
}

/**
 * Boutons rendus, avec leurs props complètes : le JSON de `toJSON()` retire
 * `children` (il expose les enfants rendus à part), l'arbre d'instances non.
 */
function buttonsOf(tree: ReactTestRenderer): Array<Record<string, unknown>> {
  return tree.root.findAll((node) => node.type === 'Button').map((node) => node.props);
}

/** Clique sur le bouton portant ce libellé. */
async function clickButton(tree: ReactTestRenderer, label: string) {
  const button = buttonsOf(tree).find((props) => props.children === label);
  expect(button).toBeDefined();
  await act(async () => {
    (button?.onClick as () => void)();
  });
}

describe('Point d\'entrée src/ui/frontend.tsx', () => {
  it('confie un StrictMode à ForgeReconciler.render', () => {
    const rendered = stubState.rendered as React.ReactElement;

    expect(rendered).not.toBeNull();
    expect(rendered.type).toBe(React.StrictMode);
  });

  it('rend l\'encart ticket sur jira:issueContext', async () => {
    const tree = await renderScreen({ type: 'jira:issueContext', issue: { key: 'PROJ-128' } });
    const json = tree.toJSON();
    const text = textOf(json);

    expect(text).toContain('Brief d\'agent — PROJ-128');
    expect(text).toContain('Préparation : 45 / 100');
    expect(text).toContain('point(s) à préciser');
    expect(text).toContain('Voir le brief');
    expect(text).toContain('Historique des tentatives');
    expect(text).toContain('non vérifié par des tests');
    expect(buttonsOf(tree).map((button) => button.children)).toContain('Confirmer');
    tree.unmount();
  });

  it('ne rend la fenêtre du brief qu\'après un clic sur « Voir le brief »', async () => {
    const tree = await renderScreen({ type: 'jira:issueContext', issue: { key: 'PROJ-128' } });

    expect(findAll(tree.toJSON(), 'Modal')).toHaveLength(0);

    await clickButton(tree, 'Voir le brief');

    const opened = tree.toJSON();
    expect(findAll(opened, 'Modal')).toHaveLength(1);
    expect(findAll(opened, 'CodeBlock')[0].text).toBe(MOCK_BRIEF_DATA.markdown);
    tree.unmount();
  });

  it('rend la page projet sur jira:projectPage', async () => {
    const tree = await renderScreen({ type: 'jira:projectPage', project: { key: 'PROJ' } });
    const text = textOf(tree.toJSON());

    expect(text).toContain('Travail des agents — PROJ');
    expect(text).toContain('Tickets prêts');
    expect(text).toContain('Comptes rendus confirmés sans correction');
    expect(text).toContain('Manques les plus fréquents du projet');
    tree.unmount();
  });

  it('rend les réglages sur jira:projectSettingsPage', async () => {
    const tree = await renderScreen({ type: 'jira:projectSettingsPage', project: { key: 'PROJ' } });
    const json = tree.toJSON();
    const text = textOf(json);

    expect(text).toContain('Réglages brief-forge — PROJ');
    expect(findAll(json, 'Textfield').map((field) => field.name)).toEqual([
      'acceptanceCriteriaField',
      'triggerStatus',
      'decisionLabels',
    ]);
    expect(findAll(json, 'TextArea').map((field) => field.name)).toEqual(['constraintsText']);
    expect(text).toContain('Enregistrer');
    tree.unmount();
  });

  it('replie sur l\'aide à la connexion hors module Jira connu', async () => {
    const tree = await renderScreen({ type: 'admin:page' });
    const text = textOf(tree.toJSON());

    expect(text).toContain('Connecter un agent de code à brief-forge');
    expect(text).toContain('https://mcp.atlassian.com/forge/abc-123');
    expect(text).toContain('claude mcp add --transport http brief-forge');
    tree.unmount();
  });

  it('bascule la langue d\'un écran rendu, sans rechargement', async () => {
    const tree = await renderScreen({ type: 'jira:projectPage', project: { key: 'PROJ' } });
    expect(textOf(tree.toJSON())).toContain('Tickets prêts');

    await clickButton(tree, 'EN');
    const text = textOf(tree.toJSON());
    expect(text).toContain('Ready issues');
    expect(text).toContain('Agent work — PROJ');
    tree.unmount();
  });
});
