/** @jsx ForgeUI.createElement */
import ForgeUI, { Form, Fragment, SectionMessage, Text, TextArea, TextField, useState } from '@forge/ui';
import { UIProjectSettingsFormData, Language } from './data';
import { tf, t } from './i18n';
import { ProjectSettingsView, toggleLanguage } from './state';
import { PageHeader } from './components/PageHeader';

export interface ProjectSettingsPageProps {
  projectKey: string;
  settings: UIProjectSettingsFormData;
  language?: Language;
}

export interface ProjectSettingsHandlers {
  onToggleLanguage: () => void;
  onSubmit: (values: UIProjectSettingsFormData) => void;
}

/** Champs du formulaire, décrits une seule fois (label + aide + valeur initiale). */
const FIELDS: Array<{
  name: keyof UIProjectSettingsFormData;
  labelKey: 'criteriaFieldLabel' | 'triggerStatusLabel' | 'constraintsLabel' | 'decisionLabelsLabel';
  descKey: 'criteriaFieldDesc' | 'triggerStatusDesc' | 'constraintsDesc' | 'decisionLabelsDesc';
  multiline?: boolean;
}> = [
  { name: 'acceptanceCriteriaField', labelKey: 'criteriaFieldLabel', descKey: 'criteriaFieldDesc' },
  { name: 'triggerStatus', labelKey: 'triggerStatusLabel', descKey: 'triggerStatusDesc' },
  { name: 'constraintsText', labelKey: 'constraintsLabel', descKey: 'constraintsDesc', multiline: true },
  { name: 'decisionLabels', labelKey: 'decisionLabelsLabel', descKey: 'decisionLabelsDesc' },
];

function renderField(
  field: (typeof FIELDS)[number],
  settings: UIProjectSettingsFormData,
  language: Language
) {
  const label = t(field.labelKey, language);
  const description = t(field.descKey, language);
  const defaultValue = settings[field.name];

  if (field.multiline) {
    return (
      <TextArea
        key={field.name}
        name={field.name}
        label={label}
        description={description}
        defaultValue={defaultValue}
      />
    );
  }

  return (
    <TextField
      key={field.name}
      name={field.name}
      label={label}
      description={description}
      defaultValue={defaultValue}
    />
  );
}

/** Écran `jira:projectSettingsPage` : réglages qui pilotent le précalcul des briefs. */
export function renderProjectSettingsPage(
  props: ProjectSettingsPageProps,
  view: ProjectSettingsView,
  handlers: ProjectSettingsHandlers
) {
  const language = view.language;

  return (
    <Fragment>
      <PageHeader
        title={tf('settingsTitle', language, { projectKey: props.projectKey })}
        subtitle={t('settingsIntro', language)}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />

      {view.saved ? (
        <SectionMessage appearance="confirmation">
          <Text>{t('saved', language)}</Text>
        </SectionMessage>
      ) : null}

      <Form
        onSubmit={(data: Record<string, unknown>) => handlers.onSubmit(asSettings(data, props.settings))}
        submitButtonText={t('save', language)}
        submitButtonAppearance="primary"
      >
        {FIELDS.map((field) => renderField(field, props.settings, language))}
      </Form>
    </Fragment>
  );
}

/** Les champs Forge arrivent en `unknown` : on ne garde que les clés connues. */
export function asSettings(
  data: Record<string, unknown>,
  fallback: UIProjectSettingsFormData
): UIProjectSettingsFormData {
  return {
    acceptanceCriteriaField: asText(data.acceptanceCriteriaField, fallback.acceptanceCriteriaField),
    triggerStatus: asText(data.triggerStatus, fallback.triggerStatus),
    constraintsText: asText(data.constraintsText, fallback.constraintsText),
    decisionLabels: asText(data.decisionLabels, fallback.decisionLabels),
  };
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export const ProjectSettingsPage = (props: ProjectSettingsPageProps) => {
  const [view, setView] = useState<ProjectSettingsView>(() => ({
    language: props.language ?? 'fr',
    saved: false,
  }));

  const handlers: ProjectSettingsHandlers = {
    onToggleLanguage: () => setView({ ...view, language: toggleLanguage(view.language) }),
    onSubmit: () => setView({ ...view, saved: true }),
  };

  return renderProjectSettingsPage(props, view, handlers);
};

export default ProjectSettingsPage;
