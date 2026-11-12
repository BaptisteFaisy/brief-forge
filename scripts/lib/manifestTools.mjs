/**
 * Référence du contrat d'outils : lecture de `manifest.yml` **sans dépendance**
 * (pas de parseur YAML dans le dépôt) puis comparaison avec ce que le serveur
 * MCP expose réellement via `tools/list`.
 *
 * Le manifeste reste la seule source de vérité : rien n'est recopié ici, donc
 * ajouter un outil ou une entrée dans `manifest.yml` met automatiquement le
 * contrôle à jour.
 */
import { line, ok, ko, step } from './output.mjs';

const SECTION = /^ {2}([A-Za-z][\w:-]*):/;
const ACTION_START = /^ {4}- key: (\S+)\s*$/;
const SIX_SPACES = /^ {6}\S/;
const INPUTS_START = /^ {6}inputs:\s*$/;
const TOOLS_START = /^ {6}tools:\s*$/;
const INPUT_NAME = /^ {8}([A-Za-z_][\w-]*):\s*$/;
const MCP_TOOL_ITEM = /^ {8}- (\S+)\s*$/;
const INPUT_PROP = /^ {10}(type|required): (\S+)\s*$/;

/** `{ actions: [{ key, inputs: [{ name, type, required }] }], mcpTools: [...] }`. */
export function parseManifest(text) {
  const out = { actions: [], mcpTools: [] };
  const state = { section: '', action: null, input: null, inInputs: false, inTools: false };
  for (const raw of text.split(/\r?\n/)) {
    readManifestLine(out, state, raw);
  }
  return out;
}

function readManifestLine(out, state, raw) {
  const section = SECTION.exec(raw);
  if (section) {
    state.section = section[1];
    state.action = null;
    state.input = null;
    state.inInputs = false;
    state.inTools = false;
    return;
  }
  if (state.section === 'action') readActionLine(out, state, raw);
  else if (state.section === 'rovo:mcp') readMcpLine(out, state, raw);
}

function readActionLine(out, state, raw) {
  const start = ACTION_START.exec(raw);
  if (start) {
    state.action = { key: start[1], inputs: [] };
    out.actions.push(state.action);
    state.input = null;
    state.inInputs = false;
    return;
  }
  if (!state.action) return;
  if (SIX_SPACES.test(raw)) {
    state.inInputs = INPUTS_START.test(raw);
    state.input = null;
    return;
  }
  if (!state.inInputs) return;
  const name = INPUT_NAME.exec(raw);
  if (name) {
    state.input = { name: name[1], type: 'string', required: false };
    state.action.inputs.push(state.input);
    return;
  }
  const prop = INPUT_PROP.exec(raw);
  if (!prop || !state.input) return;
  if (prop[1] === 'type') state.input.type = prop[2].replace(/['"]/g, '');
  else state.input.required = prop[2] === 'true';
}

function readMcpLine(out, state, raw) {
  if (TOOLS_START.test(raw)) {
    state.inTools = true;
    return;
  }
  const tool = MCP_TOOL_ITEM.exec(raw);
  if (tool && state.inTools) out.mcpTools.push(tool[1]);
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                          */
/* ------------------------------------------------------------------ */

function compareInputs(action, tool) {
  const schema = tool.inputSchema || {};
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const diffs = [];
  for (const input of action.inputs) {
    const property = properties[input.name];
    if (!property) {
      diffs.push({ tool: action.key, problem: `entrée « ${input.name} » absente du schéma exposé` });
      continue;
    }
    if (property.type && property.type !== input.type) {
      diffs.push({ tool: action.key, problem: `entrée « ${input.name} » : type ${property.type} ≠ ${input.type} (manifeste)` });
    }
    if (required.has(input.name) !== input.required) {
      diffs.push({ tool: action.key, problem: `entrée « ${input.name} » : required=${required.has(input.name)} ≠ ${input.required} (manifeste)` });
    }
  }
  for (const name of Object.keys(properties)) {
    if (!action.inputs.some((input) => input.name === name)) {
      diffs.push({ tool: action.key, problem: `entrée « ${name} » exposée mais absente du manifeste` });
    }
  }
  return diffs;
}

/** Écarts entre le manifeste et `tools/list` (noms, puis schémas d'entrées). */
export function compareTools(tools, manifest) {
  const declared = manifest.actions.map((action) => action.key);
  const exposed = tools.map((tool) => tool.name);
  const diffs = [];
  for (const name of manifest.mcpTools) {
    if (!exposed.includes(name)) {
      diffs.push({ tool: name, problem: 'outil déclaré dans le module `rovo:mcp` mais absent de `tools/list`' });
    }
  }
  for (const name of exposed) {
    if (!declared.includes(name)) diffs.push({ tool: name, problem: 'outil exposé mais absent du manifeste' });
  }
  for (const action of manifest.actions) {
    const tool = tools.find((candidate) => candidate.name === action.key);
    if (tool) diffs.push(...compareInputs(action, tool));
  }
  return { declared, exposed, diffs, ok: diffs.length === 0 };
}

export function printComparison(report) {
  step('Outils exposés par le serveur');
  for (const name of report.exposed) {
    const known = report.declared.includes(name);
    line(`  ${known ? '✓' : '✗'} ${name}${known ? '' : '  (absent du manifeste)'}`);
  }
  step(`Comparaison avec les ${report.declared.length} actions du manifeste`);
  if (report.ok) {
    ok('aucun écart : noms d’outils et schémas d’entrées correspondent au manifeste.');
    return;
  }
  ko(`${report.diffs.length} écart(s) :`);
  for (const diff of report.diffs) line(`  · ${diff.tool} — ${diff.problem}`);
}

/** Fabrique la réponse `tools/list` qu'un serveur conforme renverrait. */
export function faithfulToolList(manifest) {
  return manifest.actions.map((action) => ({
    name: action.key,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(action.inputs.map((input) => [input.name, { type: input.type }])),
      required: action.inputs.filter((input) => input.required).map((input) => input.name),
    },
  }));
}

/**
 * Auto-contrôle **hors ligne** du comparateur : sur une liste fidèle il ne doit
 * trouver aucun écart, et sur une liste volontairement abîmée (un outil retiré,
 * une entrée obligatoire rendue facultative) il doit les signaler. Sans ce
 * contrôle, un `--check` qui ne trouve rien pourrait aussi bien être un
 * comparateur cassé.
 */
export function selfTestCompare(manifest) {
  const faithful = faithfulToolList(manifest);
  const clean = compareTools(faithful, manifest);
  const broken = faithful.slice(1).map((tool, index) =>
    index === 0 ? { ...tool, inputSchema: { ...tool.inputSchema, required: [] } } : tool
  );
  const detected = compareTools(broken, manifest);
  return {
    toolCount: faithful.length,
    cleanOk: clean.ok,
    brokenDetected: !detected.ok,
    brokenDiffs: detected.diffs,
  };
}
