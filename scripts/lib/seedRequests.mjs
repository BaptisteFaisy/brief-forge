/**
 * Construction du plan de requêtes REST du jeu de démonstration.
 *
 * Ce module est pur : il transforme `demo/seed.json` en une liste de requêtes
 * décritives (`{ stage, label, product, method, path, body, … }`), sans jamais
 * toucher au réseau. `scripts/demo-seed.mjs` les imprime (dry-run) ou les joue.
 *
 * Ordre réel du seed initial (les identifiants se découvrent en route) :
 *   1. ticket de la démo          → on obtient sa clé
 *   2. trois tickets voisins      → leurs clés
 *   3. liens « Relates »          → besoin des deux
 *   4. page Confluence de décision→ son corps cite la clé du ticket (le CQL du
 *                                    collecteur fait `text ~ "<clé>"`)
 *   5. étiquette `decision` sur la page
 *   6. description du ticket complétée du lien vers la page
 *   7. commentaire décision, puis question sans réponse (en dernier : c'est ce
 *      qui laisse le manque « question sans réponse » actif)
 */

/** Jira est écrit en REST v2 : corps en texte/markup wiki, ce que lit l'app. */
export function wikiText(lines) {
  return lines.join('\n');
}

/** Faux secret assemblé à l'exécution : aucun littéral sensible dans le dépôt. */
export function fakeSecretOf(seed) {
  return {
    token: [seed.fakeSecret.prefix, seed.fakeSecret.body].join('_'),
    password: seed.fakeSecret.password,
  };
}

/** Résout les marques `{{…}}` dans une chaîne, un tableau ou un objet. */
export function substitute(value, ctx) {
  if (typeof value === 'string') return substituteText(value, ctx);
  if (Array.isArray(value)) return value.map((item) => substitute(item, ctx));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, ctx)]));
  }
  return value;
}

function substituteText(text, ctx) {
  const known = {
    '{{ISSUE_KEY}}': ctx.issueKey,
    '{{PAGE_ID}}': ctx.pageId,
    '{{NEIGHBOR0}}': ctx.NEIGHBOR0,
    '{{NEIGHBOR1}}': ctx.NEIGHBOR1,
    '{{NEIGHBOR2}}': ctx.NEIGHBOR2,
    '{{CONFLUENCE_PAGE_URL}}': ctx.pageUrl,
    '{{FAKE_TOKEN}}': ctx.fakeSecret.token,
    '{{FAKE_PASSWORD}}': ctx.fakeSecret.password,
  };
  return Object.entries(known).reduce(
    (text_, [marker, value]) => text_.replaceAll(marker, value || marker),
    text
  );
}

function request(stage, label, method, path, body, extra = {}) {
  return { stage, label, product: 'jira', method, path, body, ...extra };
}

/** Champ personne Jira : omis (et signalé) si l'accountId n'est pas fourni. */
export function personField(envName, role, warnings) {
  const id = (process.env[envName] || '').trim();
  if (id === '') {
    warnings.push(`${role} non posé : variable ${envName} absente (accountId Atlassian attendu).`);
    return undefined;
  }
  return { id };
}

/** Description de création (sans le lien de page, inconnu à ce moment). */
export function splitDescription(lines) {
  const index = lines.findIndex((line) => line.includes('{{CONFLUENCE_PAGE_URL}}'));
  if (index === -1) return { create: lines, full: lines };
  const head = lines.slice(0, index);
  while (head.length > 0 && head[head.length - 1].trim() === '') head.pop();
  if (head.length > 0 && /^h\d\./.test(head[head.length - 1])) head.pop();
  return { create: head, full: lines };
}

function issueFields(seed, summary, descriptionLines, withComponent) {
  const fields = {
    project: { key: seed.meta.projectKey },
    summary,
    description: wikiText(descriptionLines),
    issuetype: { name: seed.meta.issueType },
    labels: [...seed.meta.labels.initial],
  };
  if (withComponent) fields.components = [{ name: seed.meta.component }];
  return fields;
}

function demoIssueRequest(seed, warnings) {
  const fields = issueFields(seed, seed.issue.summary, splitDescription(seed.issue.descriptionLines).create, false);
  const reporter = personField(seed.issue.reporterAccountIdEnv, 'rapporteur', warnings);
  const assignee = personField(seed.issue.assigneeAccountIdEnv, 'assigné', warnings);
  if (reporter) fields.reporter = reporter;
  if (assignee) fields.assignee = assignee;
  return request('initial', 'créer le ticket de la démo', 'POST', `${seed.meta.jiraApiBase}/issue`, { fields }, { capture: 'issueKey' });
}

function neighborRequests(seed) {
  return seed.neighbors.map((neighbor, index) =>
    request('initial', `voisin ${index + 1}/${seed.neighbors.length} : ${neighbor.summary}`, 'POST', `${seed.meta.jiraApiBase}/issue`, issueFields(seed, neighbor.summary, neighbor.descriptionLines, true), { capture: `neighbor${index}` })
  );
}

function linkRequests(seed) {
  return seed.neighbors.map((neighbor, index) =>
    request('initial', `lier le voisin ${index + 1} au ticket (${seed.neighborLinkType})`, 'POST', `${seed.meta.jiraApiBase}/issueLink`, {
      type: { name: seed.neighborLinkType },
      inwardIssue: { key: '{{ISSUE_KEY}}' },
      outwardIssue: { key: `{{NEIGHBOR${index}}}` },
    })
  );
}

function confluenceRequests(seed) {
  const page = seed.decisions.confluencePage;
  const base = seed.meta.confluenceApiBase;
  const requests = [
    request('initial', 'page Confluence de décision', 'POST', base, {
      type: 'page',
      title: page.title,
      space: { key: seed.meta.confluenceSpaceKey },
      body: { storage: { value: wikiText(page.bodyLines), representation: 'storage' } },
    }, { capture: 'pageId', product: 'confluence' }),
  ];
  page.labels.forEach((label) => {
    requests.push(
      request('initial', `étiqueter la page « ${label} »`, 'POST', `${base}/{{PAGE_ID}}/label`, [{ prefix: 'global', name: label }], { product: 'confluence' })
    );
  });
  return requests;
}

function commentRequest(seed, label, body, extra = {}) {
  return request('initial', label, 'POST', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}/comment`, { body }, extra);
}

/** Étape `initial` : tout ce qui existe à 0:00 dans la vidéo. */
export function initialRequests(seed, warnings) {
  return [
    demoIssueRequest(seed, warnings),
    ...neighborRequests(seed),
    ...linkRequests(seed),
    ...confluenceRequests(seed),
    request('initial', 'compléter la description avec le lien de la page de décision', 'PUT', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}`, {
      fields: { description: wikiText(splitDescription(seed.issue.descriptionLines).full) },
    }),
    commentRequest(seed, 'commentaire décision (la piste de septembre écartée)', seed.decisions.comment.body),
    commentRequest(seed, 'question sans réponse (second compte si possible)', seed.question.body, { as: 'second' }),
  ];
}

/** Étape `fixed` : les trois corrections jouées à l'écran (séquence 2). */
export function fixedRequests(seed) {
  const criteria = seed.onCamera.criteria;
  const description = [
    ...seed.issue.descriptionLines,
    '',
    criteria.heading,
    ...criteria.items.map((item) => `* ${item}`),
  ];
  return [
    request('fixed', `coller les ${criteria.items.length} critères et poser le composant`, 'PUT', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}`, {
      fields: { description: wikiText(description), components: [{ name: seed.onCamera.component }] },
    }),
    request('fixed', 'répondre à la question (autre auteur que la question)', 'POST', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}/comment`, {
      body: seed.onCamera.answer.body,
    }),
  ];
}

/** Étape `poison` : le commentaire piégé de la séquence 5. */
export function poisonRequests(seed) {
  return [
    request('poison', 'commentaire piégé (instruction adressée à un agent)', 'POST', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}/comment`, {
      body: seed.onCamera.poisonedComment.body,
    }),
  ];
}

/** Étape `secret` : le commentaire au faux secret (masquage `[SECRET:…]`). */
export function secretRequests(seed) {
  return [
    request('secret', 'commentaire au faux secret (masquage attendu)', 'POST', `${seed.meta.jiraApiBase}/issue/{{ISSUE_KEY}}/comment`, {
      body: seed.fakeSecret.commentTemplate,
    }, { warnSecret: true }),
  ];
}

/** Marques identifiant les commentaires ajoutés depuis l'état 0:00. */
export function resetCommentMarkers(seed) {
  return [
    seed.reset.commentMarker,
    seed.reset.attemptCommentMarker,
    seed.onCamera.answer.body,
    seed.onCamera.poisonedComment.body,
    seed.fakeSecret.commentTemplate.split('{{')[0].trim(),
  ].filter((marker) => marker !== '');
}

/**
 * Étape `reset` : retour à l'état 0:00 de la vidéo. Le commentaire piégé n'est
 * PAS rejoué ici (il appartient à la séquence 5) : voir `--with-poison`.
 */
export function resetRequests(seed) {
  const api = seed.meta.jiraApiBase;
  const label = seed.meta.labels.clarification;
  return [
    request('reset', 'lire étiquettes et commentaires du ticket', 'GET', `${api}/issue/{{ISSUE_KEY}}?fields=labels,comment`, undefined, { capture: 'issueState', derived: true }),
    request('reset', `retirer l'étiquette « ${label} »`, 'PUT', `${api}/issue/{{ISSUE_KEY}}`, { fields: { labels: '{{LABELS_SANS_CLARIFICATION}}' } }, { derived: true, deriveNote: `étiquettes lues à l’étape 1, moins « ${label} »` }),
    request('reset', 'supprimer les commentaires ajoutés depuis l’état 0:00', 'DELETE', `${api}/issue/{{ISSUE_KEY}}/comment/{{COMMENT_ID}}`, undefined, { derived: true, repeat: true, deriveNote: `un DELETE par commentaire lu à l’étape 1 qui contient l’une des marques : ${resetCommentMarkers(seed).map((m) => `« ${m.slice(0, 32)}… »`).join(', ')}` }),
    request('reset', 'supprimer la propriété du compte rendu', 'DELETE', `${api}/issue/{{ISSUE_KEY}}/properties/${seed.reset.reportPropertyKey}`),
    request('reset', 'restaurer la description initiale et retirer le composant', 'PUT', `${api}/issue/{{ISSUE_KEY}}`, {
      fields: { description: wikiText(splitDescription(seed.issue.descriptionLines).full), components: [] },
    }),
  ];
}

const STAGE_BUILDERS = {
  initial: (seed, warnings) => initialRequests(seed, warnings),
  fixed: (seed) => fixedRequests(seed),
  poison: (seed) => poisonRequests(seed),
  secret: (seed) => secretRequests(seed),
  reset: (seed) => resetRequests(seed),
};

export const STAGES = Object.keys(STAGE_BUILDERS);

export function buildRequests(seed, stages, warnings) {
  return stages.flatMap((stage) => STAGE_BUILDERS[stage](seed, warnings));
}
