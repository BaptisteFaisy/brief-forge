import { Language } from './data';

/**
 * Table de chaînes bilingues (FR/EN) des écrans Jira.
 * Aucune dépendance i18n : une bascule simple par écran suffit (§ bilingue).
 */
export const STRINGS = {
  readiness: { fr: 'Préparation', en: 'Readiness' },
  readinessScore: { fr: 'Préparation : {score} / 100', en: 'Readiness: {score} / 100' },
  statusReady: { fr: 'Prêt', en: 'Ready' },
  statusNeedsPrecision: { fr: 'À préciser', en: 'Needs precision' },
  statusNotReady: { fr: 'Non prêt', en: 'Not ready' },
  pointsLost: { fr: '-{points} pts', en: '-{points} pts' },
  viewBrief: { fr: 'Voir le brief', en: 'View brief' },
  close: { fr: 'Fermer', en: 'Close' },
  confirm: { fr: 'Confirmer', en: 'Confirm' },
  correct: { fr: 'Corriger', en: 'Request correction' },
  save: { fr: 'Enregistrer', en: 'Save' },
  saved: { fr: 'Réglages enregistrés pour le projet.', en: 'Settings saved for this project.' },
  notVerifiedByTests: { fr: 'non vérifié par des tests', en: 'not verified by tests' },
  verifiedByTests: { fr: 'vérifié par des tests', en: 'verified by tests' },
  confirmedMessage: { fr: 'Compte rendu confirmé : aucun correctif demandé.', en: 'Report confirmed: no correction requested.' },
  correctionMessage: { fr: 'Correction demandée : l\'agent devra reprendre le travail.', en: 'Correction requested: the agent must rework.' },

  issueContextTitle: { fr: 'Brief d\'agent — {issueKey}', en: 'Agent brief — {issueKey}' },
  gapsTitle: { fr: '{count} point(s) à préciser avant l\'intervention d\'un agent', en: '{count} gap(s) to clarify before an agent works on it' },
  noGaps: { fr: 'Aucun manque identifié : le ticket est prêt pour un agent.', en: 'No gaps identified: this issue is ready for an agent.' },
  advice: { fr: 'Conseil : {advice}', en: 'Advice: {advice}' },
  briefModalTitle: { fr: 'Brief pour agent — {issueKey} (budget {budget} : ~{tokens} jetons)', en: 'Agent brief — {issueKey} (budget {budget}: ~{tokens} tokens)' },
  briefPreviewNote: { fr: 'Aperçu exact du markdown remis à l\'agent de code via le serveur MCP.', en: 'Exact markdown preview handed to the coding agent through the MCP server.' },
  attemptsTitle: { fr: 'Historique des tentatives', en: 'Attempt history' },
  noAttempts: { fr: 'Aucune tentative enregistrée pour ce ticket.', en: 'No attempt recorded for this issue yet.' },
  attemptLine: { fr: 'Tentative {index} — {agent} ({date})', en: 'Attempt {index} — {agent} ({date})' },
  criteriaCovered: { fr: 'Critères couverts : {value}', en: 'Criteria covered: {value}' },
  testsResult: { fr: 'Tests : {value}', en: 'Tests: {value}' },
  noneValue: { fr: 'aucun', en: 'none' },
  latestReport: { fr: 'Dernier compte rendu', en: 'Latest report' },
  noTestsWarning: { fr: 'Ce compte rendu n\'a pas été vérifié par des tests : relisez-le avant de fusionner.', en: 'This report was not verified by tests: review it before merging.' },

  settingsTitle: { fr: 'Réglages brief-forge — {projectKey}', en: 'brief-forge settings — {projectKey}' },
  settingsIntro: { fr: 'Ces réglages pilotent le précalcul des briefs et la détection des décisions.', en: 'These settings drive brief pre-computation and decision detection.' },
  criteriaFieldLabel: { fr: 'Champ des critères d\'acceptation', en: 'Acceptance criteria field' },
  criteriaFieldDesc: { fr: 'Identifiant du champ Jira (ex. customfield_10034) ou nom du champ.', en: 'Jira field id (e.g. customfield_10034) or field name.' },
  triggerStatusLabel: { fr: 'Statut déclencheur du précalcul', en: 'Pre-computation trigger status' },
  triggerStatusDesc: { fr: 'Lorsqu\'un ticket atteint ce statut, son brief est construit à l\'avance.', en: 'When an issue reaches this status, its brief is built ahead of time.' },
  constraintsLabel: { fr: 'Contraintes du projet (texte libre)', en: 'Project constraints (free text)' },
  constraintsDesc: { fr: 'Une contrainte par ligne ; elles sont ajoutées à chaque brief.', en: 'One constraint per line; each is added to every brief.' },
  decisionLabelsLabel: { fr: 'Étiquettes Confluence qui valent décision', en: 'Confluence labels treated as decisions' },
  decisionLabelsDesc: { fr: 'Étiquettes séparées par des virgules (ex. adr, architecture-decision).', en: 'Comma-separated labels (e.g. adr, architecture-decision).' },

  projectPageTitle: { fr: 'Travail des agents — {projectKey}', en: 'Agent work — {projectKey}' },
  metricConfirmed: { fr: 'Comptes rendus confirmés sans correction', en: 'Reports confirmed without correction' },
  metricClarifications: { fr: 'Clarifications demandées plutôt que devinées', en: 'Clarifications asked instead of guessed' },
  metricRepeated: { fr: 'Tentatives répétées évitées', en: 'Repeated attempts avoided' },
  metricRateHint: { fr: 'sur les 30 derniers jours', en: 'over the last 30 days' },
  metricCountHint: { fr: 'grâce au brief précalculé', en: 'thanks to pre-computed briefs' },
  topGapsTitle: { fr: 'Manques les plus fréquents du projet', en: 'Most frequent project gaps' },
  topGapsOccurrences: { fr: '{count} ticket(s)', en: '{count} issue(s)' },
  sectionReady: { fr: 'Tickets prêts', en: 'Ready issues' },
  sectionInProgress: { fr: 'En cours', en: 'In progress' },
  sectionReported: { fr: 'Rendus', en: 'Reported' },
  emptySection: { fr: 'Aucun ticket dans cette colonne.', en: 'No issue in this column.' },
  readinessShort: { fr: 'Préparation {score} / 100', en: 'Readiness {score} / 100' },
  agentLabel: { fr: 'Agent : {name}', en: 'Agent: {name}' },
  reportLabel: { fr: 'Dernier compte rendu : {value}', en: 'Latest report: {value}' },

  connectTitle: { fr: 'Connecter un agent de code à brief-forge', en: 'Connect a coding agent to brief-forge' },
  connectIntro: { fr: 'Un agent (Claude Code, Cursor, VS Code…) récupère le brief sourcé du ticket, travaille, puis dépose son compte rendu.', en: 'An agent (Claude Code, Cursor, VS Code…) fetches the sourced issue brief, works, then posts its report.' },
  serverAddressLabel: { fr: 'Adresse du serveur MCP', en: 'MCP server address' },
  adminStepsTitle: { fr: 'Marche à suivre pour l\'administrateur', en: 'Administrator walkthrough' },
  step1: { fr: 'Installer l\'application brief-forge sur le site Atlassian (Forge).', en: 'Install the brief-forge app on the Atlassian site (Forge).' },
  step2: { fr: 'Vérifier que le module rovo:mcp est activé et que les 11 actions sont autorisées.', en: 'Check that the rovo:mcp module is enabled and the 11 actions are allowed.' },
  step3: { fr: 'Renseigner les réglages du projet (critères, statut déclencheur, étiquettes de décision).', en: 'Fill in project settings (criteria, trigger status, decision labels).' },
  step4: { fr: 'Communiquer l\'adresse ci-dessus aux utilisateurs et l\'ajouter dans leur client MCP.', en: 'Share the address above with users and add it to their MCP client.' },
  clientCommandsTitle: { fr: 'Commande à copier, par client MCP', en: 'Command to copy, per MCP client' },
  copyHint: { fr: 'Remplacez l\'identifiant d\'application par celui affiché ci-dessus.', en: 'Replace the app id with the one shown above.' },
  addressHint: { fr: 'Le jeton d\'authentification est fourni par Atlassian : aucun secret n\'est stocké dans l\'app.', en: 'Authentication is provided by Atlassian: no secret is stored in the app.' },
} as const;

export type StringKey = keyof typeof STRINGS;

/** Traduit une clé dans la langue demandée. */
export function t(key: StringKey, language: Language): string {
  const entry = STRINGS[key];
  return language === 'en' ? entry.en : entry.fr;
}

/** Traduit puis interpole les variables `{nom}` du gabarit. */
export function tf(key: StringKey, language: Language, vars: Record<string, string | number>): string {
  return Object.keys(vars).reduce(
    (acc, name) => acc.split(`{${name}}`).join(String(vars[name])),
    t(key, language)
  );
}
