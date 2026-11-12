# Kit de démonstration rejouable

> Pour la vidéo de soumission : `docs/VIDEO-SCRIPT.md` (7 séquences, 4 min 50).
> Outillé par **`demo/seed.json`** (les données) et **`scripts/demo-seed.mjs`**
> (le générateur de requêtes REST Jira/Confluence). Aucune dépendance npm.
>
> Promesse du kit : **rejouer la vidéo autant de fois que nécessaire sans
> dépendre d'un état invisible.** Tout ce qui est dans Jira se remet à zéro par
> des requêtes REST ; tout ce qui vit dans Forge SQL se règle en prenant un
> ticket neuf.

---

## 1. Ce que le kit contient

| Élément | Rôle |
|---|---|
| `demo/seed.json` | le jeu de données (ticket, critères, décisions, voisins, contacts, trou, commentaire piégé, faux secret, scores attendus) |
| `scripts/demo-seed.mjs` | transforme le jeu en requêtes REST ; `--dry-run` par défaut, `--send` pour jouer |
| `scripts/lib/seedRequests.mjs` | construction pure du plan de requêtes (partagée, testée) |
| `docs/DEMO-KIT.md` | ce document : déroulé, remise à zéro, dépannage |

Contenu du jeu (vérifié par `test/scripts/demoSeed.test.ts`) :

- **1 ticket** « Remboursement d'un paiement partiellement capturé », objectif
  écrit, description vague, **sans** critère, **sans** composant ;
- **4 critères d'acceptation** vérifiables (collés à l'écran en séquence 2) ;
- **2 décisions applicables** : une page Confluence étiquetée `decision` et un
  commentaire Jira marqué `[décision]` ;
- **1 tentative passée refusée** (section « Déjà tenté ») ;
- **3 changements voisins** (tickets frères liés, même composant) ;
- **2 personnes à contacter** (rapporteur + assigné/auteur de la question) ;
- **1 trou assumé** : « le ticket ne dit pas si la limite s'applique par carte
  ou par client » ;
- **1 commentaire piégé** (instruction adressée à un agent) ;
- **1 faux secret** (assemblé à l'exécution, jamais en clair dans le dépôt).

---

## 2. Prérequis

| Besoin | Détail |
|---|---|
| Site de démo | `one-atlas-cndz.atlassian.net`, app « Brief de contexte » **installée** sur Jira et Confluence |
| Projet | `PAY` (le script lit `meta.projectKey` ; sinon `--site` / seed à modifier) |
| Identifiants API | `ATLASSIAN_API_EMAIL` + `ATLASSIAN_API_TOKEN` dans l'environnement |
| **Second compte** | `ATLASSIAN_API_EMAIL_2` + `ATLASSIAN_API_TOKEN_2` : sans lui, le manque « question sans réponse » ne se solde pas (§ 5) |
| accountIds | `DEMO_REPORTER_ID`, `DEMO_ASSIGNEE_ID` (optionnels : sans eux, « À qui demander » ne montre qu'une personne) |
| Client MCP | Claude Code, Cursor ou VS Code, connecté à `https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8` (protocole : `docs/MCP-E2E.md`) |

```bash
export ATLASSIAN_API_EMAIL="…"
export ATLASSIAN_API_TOKEN="…"          # jamais écrit dans le dépôt
export ATLASSIAN_API_EMAIL_2="…"        # second compte (question)
export ATLASSIAN_API_TOKEN_2="…"
```

---

## 3. Les cinq commandes

```bash
# 1. voir ce qui va être fait (aucune écriture)
node scripts/demo-seed.mjs --dry-run

# 2. poser l'état 0:00 de la vidéo (ticket, voisins, page de décision, commentaires)
node scripts/demo-seed.mjs --stage initial --send

# 3. appliquer les corrections de la séquence 2 (critères, composant, réponse)
node scripts/demo-seed.mjs --stage fixed --issue PAY-123 --send

# 4. poster le commentaire piégé (séquence 5)
node scripts/demo-seed.mjs --stage poison --issue PAY-123 --send

# 5. remettre à zéro entre deux prises
node scripts/demo-seed.mjs --stage reset --issue PAY-123 --send
```

Options utiles : `--stage all` (initial + fixed + poison + secret), `--site`,
`--issue`, `--with-poison` (rejoue le commentaire piégé après un reset),
`--timeout`.

Le script **n'écrit jamais le jeton** : il le lit dans l'environnement, ne
l'imprime pas, et refuse un jeton passé en argument.

---

## 4. Déroulé minute par minute

Repères : `B` = Baptiste à l'écran, `N` = voix off, `⟨outil⟩` = appel MCP.

| Temps | Séquence | À l'écran | Ce qui est tapé / actionné | Outil MCP | Résultat attendu |
|---|---|---|---|---|---|
| **0:00–0:35** | 1. Sans brief, l'agent refait une piste refusée | éditeur, puis Jira `PAY-xxx` | B tape « Implement PAY-123 — refund of a partially captured payment. » ; l'agent propose une colonne `refund_reason` ; B fait défiler jusqu'au commentaire de septembre | aucun (démo du problème) | le commentaire `[décision]` de septembre est visible : « l'équipe ledger a écarté la piste d'une colonne refund_reason » |
| **0:35–1:20** | 2. Le ticket est scoré, trois manques sont corrigés en direct | Rovo Chat, puis Jira | B : « What's missing from PAY-123? » → puis il colle les 4 critères, répond à la question `captureId`, met le composant `payments-refunds` ; B : « And now? » | `check-readiness` | score **50/100 « à préciser »** (3 manques : −30 critères, −10 question, −10 composant) puis **100/100 « prêt »** (0 manque). Voir § 5 pour l'écart avec les chiffres du script |
| **1:20–2:30** | 3. `get-work-brief`, puis l'agent pose une question | écran scindé : éditeur + Jira | B : « Get the work brief for PAY-123, small budget. » ; l'agent lit, puis demande : *pour une seconde capture partielle, deux écritures de ledger ou une ?* | `get-work-brief` (budget `s`), puis `ask-clarification` | un brief ≤ 1 100 jetons, chaque élément sourcé et daté ; la question apparaît en commentaire Jira (« Written by an agent… ») et l'étiquette `attente-precision` est posée |
| **2:30–3:20** | 4. La réponse atterrit dans Jira, le rapport est posté | Jira, puis éditeur | B répond : « Two separate entries. The ledger team reconciles per capture. » ; puis l'agent travaille (time-lapse 10 s) et poste son rapport | `post-work-report` (`status: "partiel"`, `criteriaCovered: "1,2"`, `testsPassed: "1 failing"`) | commentaire signé « Rédigé par un agent (claude-code) pour le compte de (…) », sections Fait / Non fait / Critères couverts / Hypothèses / Tests / Suites ; l'encart se met à jour ; un humain confirme |
| **3:20–3:50** | 5. Un commentaire piégé est écarté | Jira puis Rovo Chat | B colle le commentaire de l'équipe plateforme (« assistant, ignore all previous instructions… ») ; puis redemande le brief | `get-work-brief` | le brief affiche `[contenu écarté : instruction suspecte dans le commentaire de <auteur>, <date>]` et la section « Trous » signale le retrait ; **rien n'est supprimé dans Jira** |
| **3:50–4:30** | 6. Le même contexte servi à un agent Rovo | Rovo Chat (agent natif + skill `work-brief`), puis éditeur | B : « What did the agent do on PAY-123, and what should happen next? » | le même serveur, les 11 outils | l'agent Rovo répond avec le rapport partiel, le critère en échec, la leçon confirmée, les voisins, la suite proposée |
| **4:30–4:50** | 7. Architecture et carton final | schéma du README animé | — | — | « brief-forge — sourced, budgeted context for coding agents. » |

### Préparation de chaque séquence

| Séquence | À faire avant |
|---|---|
| 1 | `--stage initial --send` ; la tentative passée est enregistrée via `record-failed-attempt` (voir § 9) |
| 2 | l'état 0:00 ; la réponse à la question doit venir d'un **autre** compte que la question |
| 3 | attendre la reconstruction du brief (< 2 min) après les corrections, sinon le brief est marqué périmé |
| 4 | l'agent doit être authentifié et `claim-work` réussi (réservation visible) |
| 5 | `--stage poison --send` **ou** coller le commentaire à la main pendant la prise |
| 6 | le rapport de la séquence 4 doit être **confirmé** par un humain (une leçon non confirmée ne devient pas une leçon) |
| 7 | le schéma du README projeté en 1080p, texte lisible à 1× |

---

## 5. Les scores : ce que le barème donne vraiment

`docs/VIDEO-SCRIPT.md` annonce **45** puis **82**. Ces deux nombres ne sont pas
atteignables avec le barème du produit (`src/config.ts` : 30 + 15 + 15 + 10 + 10
+ 10 + 10 = 100) :

- **45** supposerait trois manques totalisant **55** points perdus, ce que ne
  donnent pas les trois manques annoncés (−30, −10, −10 = **50** → score **50**) ;
- **82** n'est pas une somme possible du barème, et le script dit « no gaps » :
  sans manque, le score est **100**.

Avec le jeu de `demo/seed.json`, les scores **réels** sont (vérifiés par
`test/scripts/demoSeed.test.ts`, qui appelle le vrai `computeReadiness`) :

| État | Score | Statut | Points perdus |
|---|---|---|---|
| initial (0:00) | **50** / 100 | à préciser | 30 (critères) + 10 (question) + 10 (composant) |
| après les 3 corrections, **réponse par un autre compte** | **100** / 100 | prêt | 0 |
| après les 3 corrections, **réponse par le même compte** | **90** / 100 | prêt | 10 (question) |

> **Pourquoi la réponse doit venir d'un autre compte.** Le critère « aucune
> question sans réponse » (`src/readiness/criteria/unansweredQuestionCheck.ts`)
> considère une question traitée dès qu'**un autre auteur** commente ensuite.
> Répondre à sa propre question ne rend donc aucun point : d'où le second
> compte (`ATLASSIAN_API_TOKEN_2`), qui pose la question, et Baptiste, qui y
> répond.

**Deux options avant d'enregistrer**, au choix :

1. **recommandé — dire les vrais chiffres en voix off** : « Fifty out of a
   hundred » / « One hundred — ready » (le plus simple, et le plus solide :
   les nombres affichés sont ceux du produit) ;
2. **garder 45 et 82** en ajustant le jeu : il faudrait un quatrième manque
   partiel pour tomber à 45, et un état intermédiaire pour 82 — donc un seed
   différent, et une narration qui ne correspond plus à l'écran.

La vidéo de soumission montre le score **affiché à l'écran** : la voix off doit
dire ce qui est écrit.

---

## 6. Remise à zéro entre deux prises

```bash
node scripts/demo-seed.mjs --stage reset --issue PAY-123 --send
```

Ce que la commande fait, dans l'ordre (5 requêtes, plus une 6ᵉ avec
`--with-poison`) :

| # | Requête | Effet |
|---|---|---|
| 1 | `GET /rest/api/2/issue/PAY-123?fields=labels,comment` | lit l'état réel (jamais d'identifiant deviné) |
| 2 | `PUT /rest/api/2/issue/PAY-123` | retire l'étiquette `attente-precision`, garde les autres |
| 3 | `DELETE /rest/api/2/issue/PAY-123/comment/{id}` | supprime les commentaires ajoutés depuis l'état 0:00 : compte rendu, tentative, **réponse à la question**, commentaire piégé, commentaire au faux secret |
| 4 | `DELETE /rest/api/2/issue/PAY-123/properties/brief-forge.work-report` | supprime la propriété du compte rendu |
| 5 | `PUT /rest/api/2/issue/PAY-123` | restaure la description initiale et retire le composant |
| 6 | `POST …/comment` | **seulement avec `--with-poison`** : rejoue le commentaire piégé (séquence 5) |

### Ce que la remise à zéro ne peut pas faire

- **Les lignes Forge SQL** (`attempt`, `claim`, `readiness`, `brief`) : aucun
  accès REST. Elles sont indexées **par clé de ticket** → **une prise vraiment
  vierge se fait sur un ticket neuf** : `--stage initial --send` crée un nouveau
  ticket, et c'est cette nouvelle clé qu'il faut utiliser dans toute la suite
  (`--issue PAY-124`, etc.).
- **La réservation `claim-work`** : verrou coopératif de 4 h, sans outil de
  libération exposé. Trois solutions : attendre l'expiration, rappeler
  `claim-work` **avec le même `agentName`** (la réservation est rafraîchie, pas
  dupliquée), ou passer au ticket neuf.

### Reprise à mi-séquence

| Besoin | Commande |
|---|---|
| rejouer la séquence 2 | `--stage reset` puis `--stage fixed` (ou les corrections à la main) |
| rejouer la séquence 5 | `--stage poison` (ou `--stage reset --with-poison`) |
| rejouer la séquence 6 | rien : le rapport de la séquence 4 doit être confirmé par un humain, pas rejoué |
| repartir de zéro | `--stage initial --send` sur un ticket neuf |

---

## 7. Si le brief arrive périmé

Symptôme : la réponse de `get-work-brief` porte `stale: true`, ou la section
« Trous » signale une collecte incomplète.

| Situation | Ce que le produit fait | Ce que fait l'opérateur |
|---|---|---|
| le ticket vient d'être modifié | les triggers Jira marquent le brief périmé et lancent la reconstruction (< 2 min, cible) | attendre ~2 min, puis rappeler l'outil |
| la reconstruction n'a pas abouti | `get-work-brief` **reconstruit à la volée** (garde de 40 s) et sert le résultat | rappeler l'outil une fois |
| la reconstruction dépasse la garde | repli sur le budget `s` (≈1 000 jetons) et `budget` renvoie la valeur réellement servie | c'est normal et annoncé : le dire, ou rappeler avec `budget: "m"` |
| la collecte d'une source échoue (Confluence 403, Teamwork Graph indisponible) | la source est signalée dans « Trous », le brief n'échoue pas | ne pas « compléter » à la main pendant la prise : le trou affiché fait partie de la démonstration |

Enregistré de toute façon : le `stale: true` est **une information**, pas une
erreur — le dire en voix off si l'écran le montre.

---

## 8. Ce que le seed REST ne peut pas faire

| Limite | Conséquence | Contournement |
|---|---|---|
| **antidater** un ticket, un commentaire, une page | les horodatages Jira/Confluence sont ceux du jour du seed | le **texte** des commentaires mentionne septembre ; ne pas zoomer sur la date à l'écran, ou seeder la veille de la prise |
| **« Déjà tenté »** et **« compte rendu »** vivent dans Forge SQL | rien à faire en REST | `record-failed-attempt` et `post-work-report` via un client MCP (le script **imprime** ces appels prêts à l'emploi) |
| **changements voisins** : Teamwork Graph ou information de développement | sans intégration SCM (GitHub/Bitbucket) sur le site, la section reste vide et le brief affiche le trou « Aucun changement voisin » | connecter l'intégration SCM avant la prise ; sinon dire « la zone n'a pas bougé cette semaine » au lieu d'annoncer deux PR |
| **réservation** (`claim-work`) | pas de libération en REST | expiration (4 h) ou re-claim avec le même nom d'agent |
| **deux contacts distincts** | sur un site à un seul compte, « À qui demander » ne montre qu'un nom | inviter un second compte (site de démo gratuit) et fournir `DEMO_ASSIGNEE_ID` + `ATLASSIAN_API_TOKEN_2` |

---

## 9. Les trois appels MCP à faire à la main

Le seed REST s'arrête là : ces trois écritures vivent dans **Forge SQL**, pas
dans Jira. `scripts/demo-seed.mjs` les imprime à chaque exécution, prêtes à
l'emploi :

```text
· record-failed-attempt {"issueKey":"PAY-123","summary":"Ajout d'une colonne refund_reason sur la table refund","reason":"Piste écartée par l'équipe ledger : …"}
· claim-work {"issueKey":"PAY-123","agentName":"claude-code"}
· post-work-report {"issueKey":"PAY-123","status":"partiel","criteriaCovered":"1,2","testsPassed":"npm test -- refunds : 1 failing","report":"## Fait\n…"}
```

- `record-failed-attempt` **avant** la séquence 3 : sans lui, la section « Déjà
  tenté » est vide ;
- `claim-work` au début de la séquence 3 ;
- `post-work-report` pendant la séquence 4 (l'agent le fait lui-même depuis le
  client MCP ; le script ne fait que l'imprimer).

---

## 10. Faux secrets et garde CI

Le faux secret est **construit à l'exécution** :

```js
const token = ['ghp', 'DEM0DEM0DEM0DEM0DEM0DEM0DEM0DEM0DEM0DEM0'].join('_');
```

Dans le dépôt, il n'y a que les deux morceaux (`demo/seed.json` →
`fakeSecret.prefix` / `fakeSecret.body`) : aucun motif de jeton en clair, donc
la garde CI passe. Cette garde (`.github/couche0/check_couche0.py`, liste
`FORBIDDEN_PATTERNS`) refuse notamment les jetons de forge et clés d'API en
clair, les poussées forcées sans garde-fou, les prises de côté forcées lors d'une
fusion, le déclencheur de workflow à privilèges, et les dates antérieures au
26 octobre. Le contrôle est rejoué sur ces fichiers par
`test/scripts/demoSeed.test.ts` et `test/scripts/mcpE2e.test.ts`.

Dans le brief, le résultat attendu est :

- le faux jeton GitHub → `[SECRET:GH_PAT]` (le **type** est conservé) ;
- le faux mot de passe → `password: [SECRET:REDACTED]`.

> ⚠ Le `--dry-run` de l'étape `secret` affiche le faux jeton assemblé : c'est
> voulu (il faut vérifier le texte), mais **ne jamais recopier cette sortie dans
> un fichier du dépôt**.

---

## 11. Checklist avant d'enregistrer

- [ ] `PAY-xxx` à l'état 0:00 : description vague, pas de critère, pas de composant
- [ ] une seule question sans réponse, posée par le second compte
- [ ] le commentaire `[décision]` de septembre visible
- [ ] la page Confluence `decision` étiquetée, liée depuis la description
- [ ] la tentative passée enregistrée (`record-failed-attempt`)
- [ ] l'agent MCP connecté et `check-readiness` déjà appelé une fois (session chaude)
- [ ] Rovo Chat ouvert avec l'agent « Brief de contexte » sélectionné
- [ ] onglets : éditeur · Jira `PAY-xxx` · page Confluence
- [ ] `get-work-brief` frais (moins de 2 min)
- [ ] polices agrandies, notifications coupées, horloge masquée
- [ ] **les chiffres de la voix off correspondent à l'écran** (§ 5)

---

## 12. Ce qui a été réellement joué

| Élément | État |
|---|---|
| `--dry-run` (étape `initial`) | **joué**, code `0`, 12 requêtes produites, 205 lignes de sortie |
| `--dry-run` (étape `all`) | **joué**, code `0`, 16 requêtes produites |
| `--dry-run` (étape `reset`) | **joué**, code `0`, 5 requêtes produites |
| `--send` contre Atlassian | **non joué** : écrit dans le site de démo, il faut les identifiants de l'opérateur |
| scores 50 / 100 / 90 | **joués hors ligne** : calculés par le vrai `computeReadiness` dans `test/scripts/demoSeed.test.ts` |
| détection du commentaire piégé, masquage du faux secret, marqueur de décision | **joués hors ligne** contre `src/security` et `src/collect/issueCollector` |

Extrait réel du `--dry-run` (étape `initial`, requêtes 1 et 10) :

```text
── 1. [initial] POST https://one-atlas-cndz.atlassian.net/rest/api/2/issue
  · objet : créer le ticket de la démo
  · en-têtes : Content-Type: application/json · Authorization: Basic <ATLASSIAN_API_EMAIL:ATLASSIAN_API_TOKEN — non affiché>
    {
      "fields": {
        "project": { "key": "PAY" },
        "summary": "Remboursement d'un paiement partiellement capturé",
        "description": "h3. Objectif\nLe remboursement d'un paiement partiellement capturé échoue aujourd'hui : …\n\nh3. Point ouvert\nLe ticket ne dit pas si la limite de remboursement s'applique par carte ou par client.\n",
        "issuetype": { "name": "Story" },
        "labels": ["paiement", "remboursement"]
      }
    }

── 10. [initial] PUT https://one-atlas-cndz.atlassian.net/rest/api/2/issue/{{ISSUE_KEY}}
  · objet : compléter la description avec le lien de la page de décision
```

La ligne 10 arrive **après** la création de la page Confluence (requête 8) :
c'est le seul ordre qui permette à la description de contenir l'URL de la page,
et à la page de contenir la clé du ticket (le collecteur la retrouve par
`label in (decision,adr) AND text ~ "<clé>"`).
