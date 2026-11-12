import React, { useState } from 'react';
import {
  Button,
  Form,
  FormFooter,
  HelperMessage,
  Label,
  Stack,
  TextArea,
  Textfield,
  useForm,
} from '@forge/react';
import { UIProjectSettingsFormData, Language } from './data';
import { tf, t } from './i18n';
import { ProjectSettingsView, toggleLanguage } from './state';
import { Notice } from './components/Notice';
import { PageHeader } from './components/PageHeader';
import { Screen } from './components/Screen';

export interface ProjectSettingsPageProps {
  projectKey: string;
  settings: UIProjectSettingsFormData;
  language?: Language;
}

export interface ProjectSettingsHandlers {
  onToggleLanguage: () => void;
  onSubmit: (values: UIProjectSettingsFormData) => void;
}

/** Props étalées sur un champ : ce que `useForm().register` renvoie. */
export interface SettingsFieldProps {
  name: string;
  id: string;
  defaultValue?: string;
  onChange?: (event: unknown) => void;
  onBlur?: () => void;
}

/**
 * Ce dont l'écran a besoin du formulaire. En production c'est `useForm` de
 * `@forge/react` ; en test c'est un objet pur (`staticSettingsForm`), ce qui
 * garde `renderProjectSettingsPage` testable sans hook ni navigateur.
 */
export interface SettingsForm {
  register: (name: string) => SettingsFieldProps;
  getFieldId: (name: string) => string;
  /** Enveloppe le gestionnaire pour qu'il reçoive les valeurs saisies. */
  submit: (handler: (values: Record<string, unknown>) => void) => () => void;
}

/** Formulaire statique : les valeurs initiales viennent des réglages connus. */
export function staticSettingsForm(settings: UIProjectSettingsFormData): SettingsForm {
  return {
    register: (name: string) => ({
      name,
      id: `field-${name}`,
      defaultValue: settings[name as keyof UIProjectSettingsFormData],
    }),
    getFieldId: (name: string) => `field-${name}`,
    submit: (handler) => () => handler({ ...settings }),
  };
}

/** Champs du formulaire, décrits une seule fois (label + aide + multiligne). */
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

/** Un champ : libellé, saisie (une ou plusieurs lignes), aide. */
function renderField(field: (typeof FIELDS)[number], language: Language, form: SettingsForm) {
  const id = form.getFieldId(field.name);
  const fieldProps = form.register(field.name);

  return (
    <Stack key={field.name} space="space.050">
      <Label labelFor={id}>{t(field.labelKey, language)}</Label>
      {field.multiline ? (
        <TextArea {...fieldProps} minimumRows={3} />
      ) : (
        <Textfield {...fieldProps} width="100%" />
      )}
      <HelperMessage>{t(field.descKey, language)}</HelperMessage>
    </Stack>
  );
}

/** Écran `jira:projectSettingsPage` : réglages qui pilotent le précalcul des briefs. */
export function renderProjectSettingsPage(
  props: ProjectSettingsPageProps,
  view: ProjectSettingsView,
  handlers: ProjectSettingsHandlers,
  form: SettingsForm
) {
  const language = view.language;

  return (
    <Screen>
      <PageHeader
        title={tf('settingsTitle', language, { projectKey: props.projectKey })}
        subtitle={t('settingsIntro', language)}
        language={language}
        onToggleLanguage={handlers.onToggleLanguage}
      />

      {view.saved ? <Notice appearance="success" text={t('saved', language)} /> : null}

      <Form onSubmit={form.submit((values) => handlers.onSubmit(asSettings(values, props.settings)))}>
        <Stack space="space.200">
          {FIELDS.map((field) => renderField(field, language, form))}
        </Stack>
        <FormFooter>
          <Button appearance="primary" type="submit">
            {t('save', language)}
          </Button>
        </FormFooter>
      </Form>
    </Screen>
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
  // `useForm` est typé sur un dictionnaire libre : les noms de champs viennent
  // de `FIELDS`, pas d'un type littéral par champ.
  const defaults: Record<string, unknown> = { ...props.settings };
  const hookForm = useForm<Record<string, unknown>>({ defaultValues: defaults });
  const form: SettingsForm = {
    register: (name: string) => hookForm.register(name),
    getFieldId: (name: string) => hookForm.getFieldId(name),
    submit: (handler) => () => {
      void hookForm.handleSubmit(handler)();
    },
  };

  const handlers: ProjectSettingsHandlers = {
    onToggleLanguage: () => setView({ ...view, language: toggleLanguage(view.language) }),
    onSubmit: () => setView({ ...view, saved: true }),
  };

  return renderProjectSettingsPage(props, view, handlers, form);
};

export default ProjectSettingsPage;
