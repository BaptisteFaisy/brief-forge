import React, { useState } from 'react';
import { CodeBlock, Heading, Stack, Text } from '@forge/react';
import { Language } from './data';
import { t } from './i18n';
import { SimpleView, toggleLanguage } from './state';
import { Notice } from './components/Notice';
import { PageHeader } from './components/PageHeader';
import { Screen, Section } from './components/Screen';
import { Strong } from './components/Strong';

export const MCP_HOST = 'https://mcp.atlassian.com/forge/';

export interface ConnectHelpProps {
  appId: string;
  language?: Language;
}

export interface ConnectHelpHandlers {
  onToggleLanguage: () => void;
}

/** Adresse du serveur MCP de cette installation (l'appId vient du contexte Forge). */
export function mcpServerUrl(appId: string): string {
  return `${MCP_HOST}${appId}`;
}

export interface ClientCommand {
  client: string;
  command: string;
}

/** Une commande prête à coller par client MCP ; l'appId est déjà substitué. */
export function clientCommands(appId: string): ClientCommand[] {
  const url = mcpServerUrl(appId);
  return [
    { client: '[CC] (CLI)', command: `claude mcp add --transport http brief-forge ${url}` },
    { client: 'Cursor', command: `{"mcpServers":{"brief-forge":{"url":"${url}"}}}` },
    { client: 'VS Code', command: `code --add-mcp '{"name":"brief-forge","url":"${url}"}'` },
  ];
}

const ADMIN_STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;

/** Page d'aide à la connexion : adresse, marche à suivre, commandes par client. */
export function renderConnectHelp(props: ConnectHelpProps, view: SimpleView, handlers: ConnectHelpHandlers) {
  const language = view.language;
  const url = mcpServerUrl(props.appId);

  return (
    <Screen>
      <PageHeader
        title={t('connectTitle', language)}
        subtitle={t('connectIntro', language)}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />

      <Section>
        <Heading size="small">{t('serverAddressLabel', language)}</Heading>
        <CodeBlock text={url} language="text" />
        <Text>{t('addressHint', language)}</Text>
      </Section>

      <Section>
        <Heading size="small">{t('adminStepsTitle', language)}</Heading>
        <Stack space="space.050">
          {ADMIN_STEP_KEYS.map((key, index) => (
            <Text key={key}>
              <Strong>{`${index + 1}.`}</Strong>
              {` ${t(key, language)}`}
            </Text>
          ))}
        </Stack>
      </Section>

      <Section>
        <Heading size="small">{t('clientCommandsTitle', language)}</Heading>
        <Notice appearance="information" text={t('copyHint', language)} />
        <Stack space="space.100">
          {clientCommands(props.appId).map((entry) => (
            <Stack key={entry.client} space="space.025">
              <Strong>{entry.client}</Strong>
              <CodeBlock text={entry.command} language="text" />
            </Stack>
          ))}
        </Stack>
      </Section>
    </Screen>
  );
}

export const ConnectHelp = (props: ConnectHelpProps) => {
  const [view, setView] = useState<SimpleView>(() => ({ language: props.language ?? 'fr' }));
  const handlers: ConnectHelpHandlers = {
    onToggleLanguage: () => setView({ language: toggleLanguage(view.language) }),
  };
  return renderConnectHelp(props, view, handlers);
};

export default ConnectHelp;
