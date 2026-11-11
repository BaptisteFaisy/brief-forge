/** @jsx ForgeUI.createElement */
import ForgeUI, { Code, Fragment, Heading, SectionMessage, Strong, Text, useState } from '@forge/ui';
import { Language } from './data';
import { t } from './i18n';
import { SimpleView, toggleLanguage } from './state';
import { PageHeader } from './components/PageHeader';

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
    <Fragment>
      <PageHeader
        title={t('connectTitle', language)}
        subtitle={t('connectIntro', language)}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />

      <Heading size="small">{t('serverAddressLabel', language)}</Heading>
      <Code text={url} language="text" />
      <Text>{t('addressHint', language)}</Text>

      <Heading size="small">{t('adminStepsTitle', language)}</Heading>
      {ADMIN_STEP_KEYS.map((key, index) => (
        <Text key={key}>
          <Strong>{`${index + 1}.`}</Strong> {t(key, language)}
        </Text>
      ))}

      <Heading size="small">{t('clientCommandsTitle', language)}</Heading>
      <SectionMessage appearance="info">
        <Text>{t('copyHint', language)}</Text>
      </SectionMessage>
      {clientCommands(props.appId).map((entry) => (
        <Fragment key={entry.client}>
          <Text>
            <Strong>{entry.client}</Strong>
          </Text>
          <Code text={entry.command} language="text" />
        </Fragment>
      ))}
    </Fragment>
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
