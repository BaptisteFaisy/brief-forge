// Site entry point — wires the generated data to the page. No network calls
// beyond the local `assets/data.json` fetch (relative path: the site is
// served under /brief-forge/).

import { renderMarkdown } from './markdown.js';
import * as i18n from './i18n.js';
import * as demo from './demo.js';

const MCP_ENDPOINT = 'https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8';
const CC_CMD = `claude mcp add --transport http brief-forge ${MCP_ENDPOINT}`;
const CURSOR_CMD = JSON.stringify(
  { mcpServers: { 'brief-forge': { url: MCP_ENDPOINT } } },
  null,
  2,
);

let DATA = null;
let currentKey = demo.LIVE_KEY;
let currentBudget = 'm';

function el(id) {
  return document.getElementById(id);
}

function buildTicketSelector() {
  const select = el('ticket-select');
  select.textContent = '';
  const live = document.createElement('option');
  live.value = demo.LIVE_KEY;
  live.textContent = `⚡ ${i18n.t('demo.liveOption')}`;
  select.appendChild(live);
  for (const ticket of DATA.tickets) {
    const option = document.createElement('option');
    option.value = ticket.key;
    option.textContent = `${ticket.key} — ${ticket.scenario}`;
    select.appendChild(option);
  }
  select.value = currentKey;
}

function buildBudgetTabs(entry) {
  const tabs = el('budget-tabs');
  tabs.textContent = '';
  const budgets = demo.availableBudgets(entry);
  budgets.forEach((budget, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'budget-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(budget === currentBudget));
    button.setAttribute('aria-controls', 'brief-panel');
    button.id = `budget-tab-${budget}`;
    button.dataset.budget = budget;
    button.textContent = `${i18n.t(`demo.budget.${budget}`)} (${budget})`;
    button.addEventListener('click', () => {
      currentBudget = budget;
      const current = demo.selectEntry(DATA, currentKey);
      buildBudgetTabs(current);
      renderBrief(current, budget);
    });
    button.setAttribute('tabindex', String(index === 0 ? '0' : '-1'));
    tabs.appendChild(button);
  });
  el('brief-panel').setAttribute('aria-labelledby', `budget-tab-${currentBudget}`);
}

function moveTabFocus(event) {
  const tabs = Array.from(el('budget-tabs').querySelectorAll('.budget-tab'));
  if (tabs.length < 2) return;
  const index = tabs.indexOf(document.activeElement);
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}

function renderMeta(entry) {
  const dl = el('demo-meta');
  dl.textContent = '';
  const live = entry.origin === 'live';
  const rows = live
    ? [
        [i18n.t('demo.meta.site'), entry.site],
        [i18n.t('demo.meta.environment'), entry.environment],
        [i18n.t('demo.meta.version'), entry.appVersion],
        [i18n.t('demo.meta.captured'), entry.capturedAt],
        [i18n.t('demo.meta.duration'), demo.formatDuration(entry.durationMs)],
      ]
    : [
        ['Ticket', entry.key],
        [i18n.t('demo.meta.scenario'), entry.scenario],
      ];
  for (const [key, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value ?? '—';
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
}

function renderReadiness(entry) {
  const readiness = entry && entry.readiness;
  el('readiness-card').hidden = !readiness;
  if (!readiness) return;
  el('readiness-score').textContent = demo.formatScore(readiness);
  const badge = el('readiness-badge');
  badge.textContent = readiness.ready ? i18n.t('readiness.readyYes') : i18n.t('readiness.readyNo');
  badge.dataset.ready = String(Boolean(readiness.ready));
  const gaps = el('readiness-gaps');
  gaps.textContent = '';
  if (!readiness.gaps || readiness.gaps.length === 0) {
    const none = document.createElement('li');
    none.textContent = i18n.t('readiness.nogaps');
    gaps.appendChild(none);
  } else {
    for (const gap of readiness.gaps) {
      const li = document.createElement('li');
      li.textContent = demo.formatGap(gap);
      gaps.appendChild(li);
    }
  }
  el('readiness-advice').textContent = readiness.advice || '';
}

function renderBrief(entry, budget) {
  const brief = demo.selectBrief(entry, budget);
  const body = el('brief-body');
  const empty = el('brief-empty');
  el('live-badge').hidden = entry.origin !== 'live';
  if (!brief) {
    body.textContent = '';
    el('brief-body').hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  el('brief-body').hidden = false;
  el('brief-body').innerHTML = renderMarkdown(brief.markdown);
  const truncated = el('brief-truncated');
  if (brief.truncatedSections && brief.truncatedSections.length > 0) {
    truncated.hidden = false;
    truncated.textContent = `${i18n.t('demo.truncated')} ${brief.truncatedSections.join(', ')}`;
  } else {
    truncated.hidden = true;
  }
}

function renderEntry(entry, budget) {
  buildBudgetTabs(entry);
  renderMeta(entry);
  renderBrief(entry, budget);
  renderReadiness(entry);
}

function renderFidelity() {
  const e = DATA.engine;
  el('f-metric-fix').textContent = String(e.fixtures);
  el('f-metric-bud').textContent = String(e.budgets.length);
  el('f-metric-briefs').textContent = String(e.fixtures * e.budgets.length);
  el('f-metric-exported').textContent = String(e.exported);
}

function renderArchitecture() {
  const flow = el('arch-flow');
  flow.textContent = '';
  const nodes = ['arch.agent', 'arch.mcp', 'arch.app', 'arch.jira'];
  nodes.forEach((key, i) => {
    const li = document.createElement('li');
    li.className = 'arch-node';
    li.textContent = i18n.t(key);
    li.setAttribute('data-step', String(i + 1));
    flow.appendChild(li);
  });
  el('arch-loop').textContent = i18n.t('arch.loop');
}

function quoteBlock(texts) {
  const pre = document.createElement('pre');
  texts.forEach((line) => {
    const code = document.createElement('code');
    code.textContent = line;
    pre.appendChild(code);
    pre.appendChild(document.createTextNode('\n'));
  });
  return pre;
}

function renderEvidence() {
  const md = DATA.live.briefs.m.markdown;
  const secretPre = el('evidence-secret');
  secretPre.textContent = '';
  quoteBlock(demo.findSecretLines(md)).childNodes.forEach((n) => secretPre.appendChild(n));
  const injectPre = el('evidence-inject');
  injectPre.textContent = '';
  quoteBlock(demo.findRejectedLines(md)).childNodes.forEach((n) => injectPre.appendChild(n));
}

function renderJudgeCommands() {
  el('judge-cmd-cc').textContent = CC_CMD;
  el('judge-cmd-cursor').textContent = CURSOR_CMD;
}

function copyText(button, text) {
  const done = (ok) => {
    const original = button.dataset.original ?? button.textContent;
    button.dataset.original = original;
    button.textContent = ok ? i18n.t('demo.copyDone') : original;
    if (!ok) return;
    setTimeout(() => {
      button.textContent = original;
      button.dataset.original = '';
    }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    document.body.appendChild(ta);
    ta.select();
    try {
      done(document.execCommand('copy'));
    } catch {
      done(false);
    }
    document.body.removeChild(ta);
  }
}

function bindControls() {
  el('ticket-select').addEventListener('change', (e) => {
    currentKey = e.target.value;
    const entry = demo.selectEntry(DATA, currentKey);
    currentBudget = (demo.availableBudgets(entry)[0] ?? 'm');
    renderEntry(entry, currentBudget);
  });
  el('copy-brief').addEventListener('click', () => {
    const entry = demo.selectEntry(DATA, currentKey);
    const brief = demo.selectBrief(entry, currentBudget);
    if (brief) copyText(el('copy-brief'), brief.markdown);
  });
  el('copy-cc').addEventListener('click', () => copyText(el('copy-cc'), CC_CMD));
  el('copy-cursor').addEventListener('click', () => copyText(el('copy-cursor'), CURSOR_CMD));
  el('budget-tabs').addEventListener('keydown', moveTabFocus);
  el('lang-toggle').addEventListener('click', () => {
    i18n.setLang(i18n.currentLang() === 'fr' ? 'en' : 'fr');
  });
  document.addEventListener('i18n:change', renderEverything);
}

function renderEverything() {
  i18n.apply(document);
  buildTicketSelector();
  const entry = demo.selectEntry(DATA, currentKey);
  renderEntry(entry, currentBudget);
  renderFidelity();
  renderArchitecture();
  renderEvidence();
  renderJudgeCommands();
}

function showError() {
  el('brief-empty').hidden = false;
  el('brief-empty').textContent = i18n.t('demo.error');
}

async function main() {
  i18n.init();
  try {
    const response = await fetch('assets/data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    DATA = await response.json();
  } catch {
    showError();
    return;
  }
  bindControls();
  renderEverything();
}

main();