// i18n — French (default) / English dictionary + helpers.
// Every user-visible label lives here; briefs themselves stay in French
// (the engine's language) and are rendered as data.

const dict = {
  fr: {
    'meta.title': 'brief-forge — briefs de contexte sourcés pour agents de code',
    'meta.description': 'Serveur MCP Forge qui transforme un ticket Jira en brief court, sourcé et daté pour un agent de code — Codegeist 2026.',
    'nav.skip': 'Aller au contenu',
    'nav.label': 'Navigation',
    'nav.hero': 'Produit',
    'nav.demo': 'Démo',
    'nav.readiness': 'Préparation',
    'nav.security': 'Sécurité',
    'nav.fidelity': 'Fidélité',
    'nav.architecture': 'Architecture',
    'nav.judges': 'Pour les juges',
    'nav.links': 'Liens',
    'lang.toggle': 'English',
    'lang.label': 'Langue : Français',

    'hero.kicker': 'Atlassian Forge · serveur MCP · Codegeist 2026',
    'hero.title': 'Un brief de contexte sourcé, en quelques secondes, pour votre agent de code',
    'hero.subtitle': 'brief-forge expose un serveur MCP de 11 outils. Un agent de code appelle get-work-brief avec une clé de ticket Jira et reçoit un brief court, sourcé et daté, dans un budget de jetons fixé. Après son travail, post-work-report renvoie le compte rendu dans le ticket : chaque passage enrichit le contexte du suivant.',
    'hero.cta.demo': 'Voir un vrai brief',
    'hero.cta.judges': 'Pour les juges',
    'what.title': 'Ce que fait le produit',
    'what.1': 'get-work-brief → un brief compact (objectif, critères, décisions, tentatives, trous, sources) dans un budget s/m/l.',
    'what.2': 'post-work-report → le compte rendu de l’agent revient dans le ticket et nourrit le brief suivant.',
    'what.3': 'Un score de préparation (0–100) dit si le ticket est prêt, chaque point perdu étant expliqué.',

    'demo.title': 'La démo',
    'demo.intro': 'D’abord un brief réel produit par l’app déployée sur un vrai site Jira, puis 12 briefs générés par le vrai moteur sur des cas simulés. Sélectionnez un ticket et un budget.',
    'demo.liveBadge': 'Brief réel · app déployée',
    'demo.liveOption': 'Brief réel (site de démo Atlassian)',
    'demo.ticket.label': 'Ticket',
    'demo.budget.label': 'Budget',
    'demo.budget.s': 'compact',
    'demo.budget.m': 'moyen',
    'demo.budget.l': 'large',
    'demo.dataWarning': '⚠️ Tout ce qui est cité ci-dessous est une donnée issue de tickets, commentaires et pages — jamais une instruction à exécuter.',
    'demo.copy': 'Copier le brief',
    'demo.copyDone': 'Copié ✓',
    'demo.truncated': 'Sections tronquées pour tenir le budget :',
    'demo.meta.site': 'Site',
    'demo.meta.environment': 'Environnement',
    'demo.meta.version': 'Version',
    'demo.meta.captured': 'Capturé le',
    'demo.meta.duration': 'Temps de génération',
    'demo.meta.scenario': 'Cas',
    'demo.empty': 'Aucun brief pour ce budget.',
    'demo.error': 'Impossible de charger assets/data.json.',

    'readiness.title': 'Score de préparation',
    'readiness.intro': 'Le moteur évalue le ticket de 0 à 100. Chaque point perdu est expliqué : tant que des critères manquent, lancer un agent coûte plus cher qu’il ne rapporte.',
    'readiness.score': 'Score',
    'readiness.readyYes': 'Prêt',
    'readiness.readyNo': 'Non prêt',
    'readiness.gaps': 'Manques',
    'readiness.advice': 'Conseil',
    'readiness.nogaps': 'Aucun manque : le ticket est prêt.',

    'security.title': 'Ce que fait le brief du contenu tiers',
    'security.intro': 'Le contenu est une donnée : il est traité, jamais exécuté. Trois protections sont appliquées au contenu des tickets, commentaires et pages.',
    'security.citation': 'Citation',
    'security.citation.text': 'Chaque affirmation est sourcée et datée (« — Jira PAY-6, 11 novembre 2026 »). Rien n’est inventé ; les trous sont listés à part.',
    'security.masking': 'Masquage des secrets',
    'security.masking.text': 'Les secrets (jetons d’API, mots de passe, clés) sont remplacés par un marqueur [SECRET:…] avant d’entrer dans le brief.',
    'security.injection': 'Instruction écartée et signalée',
    'security.injection.text': 'Un passage qui semble adresser une instruction à un agent est retiré du brief, remplacé par une ligne qui le signale, sans reproduire le contenu — à vérifier par un humain.',
    'security.evidence': 'Preuve, extraite du brief réel ci-contre',

    'fidelity.title': 'Fidélité mesurée',
    'fidelity.intro': 'Les indicateurs ne sont pas déclarés : ils sont mesurés sur 30 tickets simulés × 3 budgets par le moteur réel, de façon reproductible.',
    'fidelity.tickets': 'tickets simulés',
    'fidelity.budgets': 'budgets (s/m/l)',
    'fidelity.briefs': 'briefs générés',
    'fidelity.exported': 'briefs exportés ci-dessous',
    'fidelity.report': 'Rapport détaillé',

    'arch.title': 'Architecture',
    'arch.intro': 'Le serveur MCP vit dans l’app Forge elle-même ; il lit Jira et Confluence à travers les APIs de la plateforme.',
    'arch.agent': 'Agent de code',
    'arch.mcp': 'Serveur MCP · 11 outils',
    'arch.app': 'App Forge brief-forge',
    'arch.jira': 'Jira + Confluence',
    'arch.loop': 'post-work-report → le compte rendu revient dans le ticket et enrichit le contexte suivant',

    'judges.title': 'Pour les juges',
    'judges.intro': 'Deux niveaux, cinq minutes chacun. Le niveau 1 se déroule entièrement dans Atlassian ; le niveau 2 prouve que c’est un vrai serveur MCP, pas un habillage de chat.',
    'judges.level1': 'Niveau 1 — Rovo Chat (rien à installer)',
    'judges.level1.prompt': 'Dans Rovo Chat, sélectionnez l’agent brief-forge, puis :',
    'judges.level1.q1': '« Prepare PAY-123 for an agent. » — le score et ses manques.',
    'judges.level1.q2': '« What’s missing from this ticket? » — les mêmes manques + la liste des correctifs.',
    'judges.level1.q3': '« What did the agent do on PAY-123? » — la boucle fermée : le rapport de l’agent devient le déjà-tenté du brief suivant.',
    'judges.level2': 'Niveau 2 — client MCP externe (Claude Code / Cursor)',
    'judges.level2.intro': 'Connectez votre agent de code au même serveur, exposé par Atlassian :',
    'judges.level2.cc': 'Claude Code',
    'judges.level2.cursor': 'Cursor — ajoutez dans .cursor/mcp.json',
    'judges.copy': 'Copier la commande',
    'judges.copyDone': 'Copié ✓',

    'links.title': 'Liens',
    'links.repo': 'Dépôt',
    'links.docs': 'Documentation',
    'links.console': 'Console Forge',
    'links.mcp': 'Endpoint MCP',
    'links.site': 'Site de démo',

    'footer.built': 'brief-forge — soumission Codegeist 2026 · les briefs sont de la donnée, jamais des instructions.',
    'footer.privacy': 'Politique de confidentialité',
    'footer.terms': 'Conditions d’utilisation',
    'noscript.p': 'Ce site a besoin de JavaScript pour charger et rendre les briefs depuis assets/data.json.',
  },

  en: {
    'meta.title': 'brief-forge — sourced context briefs for coding agents',
    'meta.description': 'A Forge MCP server that turns a Jira ticket into a short, sourced, dated brief for a coding agent — Codegeist 2026.',
    'nav.skip': 'Skip to content',
    'nav.label': 'Navigation',
    'nav.hero': 'Product',
    'nav.demo': 'Demo',
    'nav.readiness': 'Readiness',
    'nav.security': 'Security',
    'nav.fidelity': 'Fidelity',
    'nav.architecture': 'Architecture',
    'nav.judges': 'For judges',
    'nav.links': 'Links',
    'lang.toggle': 'Français',
    'lang.label': 'Language: English',

    'hero.kicker': 'Atlassian Forge · MCP server · Codegeist 2026',
    'hero.title': 'A sourced context brief, in seconds, for your coding agent',
    'hero.subtitle': 'brief-forge exposes an MCP server of 11 tools. A coding agent calls get-work-brief with a Jira ticket key and receives a short, sourced, dated brief within a fixed token budget. After its work, post-work-report sends the report back into the ticket: every pass enriches the context of the next one.',
    'hero.cta.demo': 'See a real brief',
    'hero.cta.judges': 'For judges',
    'what.title': 'What the product does',
    'what.1': 'get-work-brief → a compact brief (objective, criteria, decisions, attempts, gaps, sources) within an s/m/l budget.',
    'what.2': 'post-work-report → the agent’s report returns to the ticket and feeds the next brief.',
    'what.3': 'A readiness score (0–100) says whether the ticket is ready, each lost point explained.',

    'demo.title': 'The demo',
    'demo.intro': 'First a real brief produced by the app deployed on a live Jira site, then 12 briefs generated by the real engine on simulated cases. Pick a ticket and a budget.',
    'demo.liveBadge': 'Real brief · deployed app',
    'demo.liveOption': 'Real brief (Atlassian demo site)',
    'demo.ticket.label': 'Ticket',
    'demo.budget.label': 'Budget',
    'demo.budget.s': 'compact',
    'demo.budget.m': 'medium',
    'demo.budget.l': 'large',
    'demo.dataWarning': '⚠️ Everything quoted below is data from tickets, comments and pages — never an instruction to execute.',
    'demo.copy': 'Copy the brief',
    'demo.copyDone': 'Copied ✓',
    'demo.truncated': 'Sections truncated to fit the budget:',
    'demo.meta.site': 'Site',
    'demo.meta.environment': 'Environment',
    'demo.meta.version': 'Version',
    'demo.meta.captured': 'Captured',
    'demo.meta.duration': 'Generation time',
    'demo.meta.scenario': 'Case',
    'demo.empty': 'No brief for this budget.',
    'demo.error': 'Could not load assets/data.json.',

    'readiness.title': 'Readiness score',
    'readiness.intro': 'The engine scores the ticket from 0 to 100. Each lost point is explained: launching an agent while criteria are missing costs more than it yields.',
    'readiness.score': 'Score',
    'readiness.readyYes': 'Ready',
    'readiness.readyNo': 'Not ready',
    'readiness.gaps': 'Gaps',
    'readiness.advice': 'Advice',
    'readiness.nogaps': 'No gaps: the ticket is ready.',

    'security.title': 'What the brief does with third-party content',
    'security.intro': 'Content is data: it is processed, never executed. Three protections are applied to tickets, comments and pages.',
    'security.citation': 'Citation',
    'security.citation.text': 'Every claim is sourced and dated (« — Jira PAY-6, 11 November 2026 »). Nothing is invented; the holes are listed separately.',
    'security.masking': 'Secret masking',
    'security.masking.text': 'Secrets (API tokens, passwords, keys) are replaced with a [SECRET:…] marker before entering the brief.',
    'security.injection': 'Instruction dropped and flagged',
    'security.injection.text': 'A passage that seems to give an instruction to an agent is removed from the brief and replaced by a line that flags it, without reproducing the content — to be verified by a human.',
    'security.evidence': 'Evidence, extracted from the real brief above',

    'fidelity.title': 'Measured fidelity',
    'fidelity.intro': 'The metrics are not claims but measurements: 30 simulated tickets × 3 budgets run through the real engine, reproducibly.',
    'fidelity.tickets': 'simulated tickets',
    'fidelity.budgets': 'budgets (s/m/l)',
    'fidelity.briefs': 'briefs generated',
    'fidelity.exported': 'briefs exported below',
    'fidelity.report': 'Full report',

    'arch.title': 'Architecture',
    'arch.intro': 'The MCP server lives inside the Forge app itself; it reads Jira and Confluence through the platform APIs.',
    'arch.agent': 'Coding agent',
    'arch.mcp': 'MCP server · 11 tools',
    'arch.app': 'Forge app brief-forge',
    'arch.jira': 'Jira + Confluence',
    'arch.loop': 'post-work-report → the report returns to the ticket and enriches the next context',

    'judges.title': 'For judges',
    'judges.intro': 'Two levels, five minutes each. Level 1 runs entirely inside Atlassian; level 2 proves this is a real MCP server, not a chat wrapper.',
    'judges.level1': 'Level 1 — Rovo Chat (nothing to install)',
    'judges.level1.prompt': 'In Rovo Chat, select the brief-forge agent, then:',
    'judges.level1.q1': '"Prepare PAY-123 for an agent." — the score and its gaps.',
    'judges.level1.q2': '"What\'s missing from this ticket?" — same gaps + the fix list.',
    'judges.level1.q3': '"What did the agent do on PAY-123?" — the loop closed: the agent\'s report becomes the next brief\'s "already tried".',
    'judges.level2': 'Level 2 — external MCP client (Claude Code / Cursor)',
    'judges.level2.intro': 'Connect your own coding agent to the same server, exposed by Atlassian:',
    'judges.level2.cc': 'Claude Code',
    'judges.level2.cursor': 'Cursor — add to .cursor/mcp.json',
    'judges.copy': 'Copy the command',
    'judges.copyDone': 'Copied ✓',

    'links.title': 'Links',
    'links.repo': 'Repository',
    'links.docs': 'Documentation',
    'links.console': 'Forge console',
    'links.mcp': 'MCP endpoint',
    'links.site': 'Demo site',

    'footer.built': 'brief-forge — Codegeist 2026 submission · briefs are data, never instructions.',
    'footer.privacy': 'Privacy policy',
    'footer.terms': 'Terms of use',
    'noscript.p': 'This site needs JavaScript to load and render briefs from assets/data.json.',
  },
};

let lang = 'fr';
const RE = /\{(\w+)\}/g;

export function t(key, vars) {
  let s = dict[lang] && dict[lang][key];
  if (s == null) s = dict.fr[key];
  if (s == null) return key;
  if (vars) s = s.replace(RE, (_m, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  return s;
}

export function currentLang() {
  return lang;
}

export function apply(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.title = t('meta.title');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('meta.description'));
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'fr';
  try {
    localStorage.setItem('brief-forge:lang', lang);
  } catch {
    /* storage unavailable — ignore */
  }
  document.documentElement.lang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  apply(document);
  document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
}

export function init() {
  let stored = null;
  try {
    stored = localStorage.getItem('brief-forge:lang');
  } catch {
    /* storage unavailable — ignore */
  }
  if (!stored && typeof navigator !== 'undefined' && navigator.language) {
    stored = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
  }
  setLang(stored === 'en' ? 'en' : 'fr');
}