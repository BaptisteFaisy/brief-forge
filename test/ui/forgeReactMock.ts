/**
 * Doublure de `@forge/react` pour les tests hors navigateur.
 *
 * Pourquoi une doublure : le paquet réel importe `@forge/bridge`, qui lève
 * « Unable to establish a connection with the Custom UI bridge » dès le
 * chargement hors d'un produit Atlassian. Impossible donc de l'importer dans
 * Jest (`testEnvironment: 'node'`).
 *
 * Fidélité : dans `@forge/react`, les composants UI Kit SONT des chaînes
 * (`exports.Text = 'Text'`, cf. `out/components/ui-kit-components.js`) que le
 * réconciliateur Forge interprète côté hôte. La doublure reproduit ce contrat
 * à l'identique — le nom du composant est la chaîne — et ne fournit que des
 * noms réellement exportés par le paquet. Un composant UI Kit 1
 * (`StatusLozenge`, `ButtonSet`, `ModalDialog`, `TextField`…) ou une faute de
 * frappe donne `undefined`, donc un élément React invalide et un test rouge.
 *
 * `test/ui/migration.test.ts` revérifie `UI_KIT_COMPONENTS` contre les exports
 * déclarés du paquet installé : la liste ne peut pas dériver en silence.
 */

/** Composants UI Kit 2 exportés par `@forge/react` (hors marqueurs UI Kit 1). */
export const UI_KIT_COMPONENTS: ReadonlySet<string> = new Set([
  'AdfRenderer', 'AtlassianIcon', 'AtlassianTile', 'Badge', 'BarChart', 'Bleed', 'Box',
  'Breadcrumbs', 'BreadcrumbsItem', 'Button', 'ButtonGroup', 'Calendar', 'Checkbox',
  'CheckboxGroup', 'ChromelessEditor', 'Code', 'CodeBlock', 'Comment', 'CommentEditor',
  'DatePicker', 'DonutChart', 'DynamicTable', 'EmptyState', 'ErrorMessage', 'FileCard',
  'FilePicker', 'Form', 'FormFooter', 'FormHeader', 'FormSection', 'Frame', 'Heading',
  'HelperMessage', 'HorizontalBarChart', 'HorizontalStackBarChart', 'Icon', 'Image', 'Inline',
  'InlineEdit', 'Label', 'LineChart', 'Link', 'LinkButton', 'List', 'ListItem',
  'LoadingButton', 'Lozenge', 'Modal', 'ModalBody', 'ModalFooter', 'ModalHeader', 'ModalTitle',
  'ModalTransition', 'Pagination', 'PieChart', 'Popup', 'Pressable', 'ProgressBar',
  'ProgressTracker', 'Radio', 'RadioGroup', 'Range', 'RequiredAsterisk', 'SectionMessage',
  'SectionMessageAction', 'Select', 'Spinner', 'Stack', 'StackBarChart', 'Tab', 'TabList',
  'TabPanel', 'Tabs', 'Tag', 'TagGroup', 'Text', 'TextArea', 'Textfield', 'Tile',
  'TimePicker', 'Toggle', 'Tooltip', 'User', 'UserGroup', 'UserPicker', 'ValidMessage',
]);

/**
 * Marqueurs UI Kit 1 encore exportés mais `@deprecated` : refusés par la
 * doublure, pour qu'aucun écran ne puisse y revenir.
 */
export const DEPRECATED_UI_KIT_EXPORTS: readonly string[] = ['Em', 'Strike', 'Strong'];

/** Noms UI Kit 1 disparus d'UI Kit 2 (rappel documentaire des renommages). */
export const RENAMED_UI_KIT_1: Readonly<Record<string, string>> = {
  StatusLozenge: 'Lozenge',
  ButtonSet: 'ButtonGroup',
  ModalDialog: 'ModalTransition + Modal + ModalHeader/ModalTitle/ModalBody/ModalFooter',
  TextField: 'Textfield',
  Table: 'DynamicTable',
  Fragment: 'React.Fragment',
  Strong: 'Text as="span" weight="bold"',
  Em: 'Text as="em"',
};

export interface StubState {
  /** Élément passé à `ForgeReconciler.render` par le point d'entrée. */
  rendered: unknown;
  productContext: unknown;
  config: unknown;
  theme: unknown;
}

export const stubState: StubState = {
  rendered: null,
  productContext: {},
  config: {},
  theme: { darkMode: false },
};

/** `useForm` minimal mais fonctionnel : valeurs par défaut + soumission synchrone. */
function useFormStub(props?: { defaultValues?: Record<string, unknown> }) {
  const values: Record<string, unknown> = { ...(props?.defaultValues ?? {}) };
  const getFieldId = (name: string) => `form-stub-${name}`;
  return {
    getFieldId,
    register: (name: string) => ({
      name,
      id: getFieldId(name),
      defaultValue: values[name],
      onChange: () => undefined,
      onBlur: () => undefined,
    }),
    handleSubmit: (handler: (submitted: Record<string, unknown>) => unknown) => () => {
      handler(values);
    },
    formState: {
      errors: {}, isSubmitted: false, isSubmitSuccessful: false, isSubmitting: false,
      submitCount: 0, isValid: true, dirtyFields: {}, touchedFields: {},
    },
    getValues: () => values,
    trigger: () => Promise.resolve(true),
    clearErrors: () => undefined,
  };
}

/** Exports non-composants du paquet réel (hooks, réconciliateur, utilitaires). */
export const NON_COMPONENT_EXPORTS: readonly string[] = [
  'default', 'xcss', 'useForm', 'useProductContext', 'useConfig', 'useTheme',
  'usePermissions', 'useTranslation', 'useContentProperty', 'useIssueProperty',
  'useSpaceProperty', 'useObjectStore', 'I18nProvider', 'replaceUnsupportedDocumentNodes',
];

/** Exports non-composants du paquet (hooks, réconciliateur, utilitaires). */
const KNOWN_EXPORTS: Record<string, unknown> = {
  __esModule: true,
  default: {
    render: (element: unknown) => {
      stubState.rendered = element;
    },
    addConfig: () => undefined,
  },
  xcss: (style: unknown) => style,
  useForm: useFormStub,
  useProductContext: () => stubState.productContext,
  useConfig: () => stubState.config,
  useTheme: () => stubState.theme,
  usePermissions: () => ({ hasPermission: () => true, missingPermissions: [] }),
  useTranslation: () => ({ t: (key: string) => key }),
  useContentProperty: () => undefined,
  useIssueProperty: () => undefined,
  useSpaceProperty: () => undefined,
  useObjectStore: () => undefined,
  I18nProvider: 'I18nProvider',
  replaceUnsupportedDocumentNodes: (node: unknown) => node,
};

/**
 * Le module `@forge/react` de substitution : un composant UI Kit demandé est
 * renvoyé sous forme de chaîne, exactement comme le paquet réel.
 */
export const forgeReactMock = new Proxy(KNOWN_EXPORTS, {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (prop in target) return target[prop];
    return UI_KIT_COMPONENTS.has(prop) ? prop : undefined;
  },
});
