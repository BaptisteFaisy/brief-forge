# Protocole de test de bout en bout avec un vrai client MCP

> Complète `docs/DEPLOY.md` § 7 (validations **(a)** et **(b)** du cahier des
> charges § 15). Outillé par `scripts/mcp-e2e.mjs` (+ `scripts/lib/*.mjs`),
> **sans aucune dépendance npm** : `fetch`, `node:crypto` et `node:fs` du
> runtime Node suffisent (Node ≥ 18).
>
> Règle de lecture : tout ce qui est marqué **[machine]** est joué par le
> script ; tout ce qui est marqué **[humain]** ne peut pas l'être (navigateur,
> console d'administration).

Point d'accès du serveur MCP de l'app de démonstration :

```
https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8
```

---

## 1. Qui fait quoi

| Étape | Qui | Comment |
|---|---|---|
| Lire le défi `401 + WWW-Authenticate` | **[machine]** | `--discovery --probe` |
| Lire `/.well-known/oauth-protected-resource/…` | **[machine]** | `--discovery` |
| Lire `/.well-known/oauth-authorization-server/…` | **[machine]** | `--discovery` |
| Générer le PKCE et l'URL de consentement | **[machine]** | `--auth-url` |
| Activation de l'exposition externe (Admin Atlassian) | **[humain]** | § 7.1 |
| Consentement OAuth 2.1 dans le navigateur | **[humain]** | § 7.2 |
| Transmission du jeton au script | **[humain]** | `MCP_TOKEN` / `--token-file` |
| `initialize` → `tools/list` → `tools/call` | **[machine]** | `--check`, `--run` |
| Cas de refus (BC-09, écriture sans identité) | **[machine]** pour la couche transport, **[humain]** pour le second compte | § 6 |
| Vérification dans un vrai client (Claude Code, Cursor) | **[humain]** | § 8 |

---

## 2. Découverte OAuth, pas à pas

### ÉTAPE 0 — le défi `401` **[machine, `--probe`]**

Une requête **non authentifiée** sur le point d'accès doit répondre `401` avec
un en-tête `WWW-Authenticate` porteur de `resource_metadata` (RFC 9728). C'est
cet en-tête qui indique où lire la suite :

```
WWW-Authenticate: Bearer resource_metadata="https://mcp.atlassian.com/.well-known/oauth-protected-resource/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8"
```

Le script lit l'URL entre guillemets ; à défaut il la **déduit** du chemin du
point d'accès (c'est ce que fait `--discovery` sans `--probe`).

### ÉTAPES 1 et 2 — les deux documents `.well-known` **[machine]**

```bash
node scripts/mcp-e2e.mjs --discovery          # les deux .well-known, sans jeton
node scripts/mcp-e2e.mjs --discovery --probe  # + le POST non authentifié de l'ÉTAPE 0
```

Sortie **réellement obtenue** le 12 novembre sur l'app de démonstration
(`--discovery`, code de sortie `0`) :

```text
brief-forge — test de bout en bout du serveur MCP
  · point d’accès : https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8
  · ÉTAPE 0 non jouée : l’URL des métadonnées est déduite du point d’accès.
  ·   (ajoutez --probe pour lire le vrai WWW-Authenticate : POST https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8 sans jeton)

── ÉTAPE 1/2 — GET https://mcp.atlassian.com/.well-known/oauth-protected-resource/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8
  · resource : https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8
  · authorization_servers : https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3
  · scopes_supported : read:me, read:account, offline_access, email, read:jira-work, write:jira-work, search:confluence, read:confluence-user, read:page:confluence, write:page:confluence, read:comment:confluence, write:comment:confluence, read:space:confluence, read:hierarchical-content:confluence, write:component:compass, read:component:compass, read:scorecard:compass, write:scorecard:compass, read:event:compass, read:metric:compass, read:all:twg, write:all:twg
  · bearer_methods_supported : header

── ÉTAPE 2/2 — métadonnées du serveur d’autorisation https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3
  · URL retenue : https://auth.atlassian.com/.well-known/oauth-authorization-server/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3
  · issuer : https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3
  · authorization_endpoint : https://auth.atlassian.com/authorize
  · token_endpoint : https://auth.atlassian.com/oauth/token
  · registration_endpoint : https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3/dcr/register
  · scopes_supported : (non annoncé)
  · grant_types_supported : authorization_code, client_credentials, refresh_token, urn:ietf:params:oauth:grant-type:token-revoke, urn:ietf:params:oauth:grant-type:jwt-bearer, urn:ietf:params:oauth:grant-type:token-exchange
  · code_challenge_methods_supported : S256

  ✓ découverte OAuth complète : scopes, serveur d’autorisation et méthodes bearer sont annoncés.
  La suite du protocole exige un humain :
    1. activation admin de l’exposition externe (si le site l’exige)
    2. consentement OAuth 2.1 dans un navigateur
    3. jeton transmis via MCP_TOKEN ou --token-file
```

Ce que cette sortie prouve, sans jeton et sans navigateur :

- le serveur MCP est **publié** et renvoie vers ses métadonnées de ressource ;
- le serveur d'autorisation est `https://auth.atlassian.com/<realm>` ;
- le jeton se présente **en en-tête** (`bearer_methods_supported: header`) ;
- PKCE **S256** est exigé (`code_challenge_methods_supported`), et le flux est
  `authorization_code` (+ `refresh_token`) ;
- les scopes annoncés couvrent bien ce que demande `manifest.yml`
  (`read:jira-work`, `write:jira-work`, `read:page:confluence`, …) ;
- un `registration_endpoint` existe : un client MCP peut s'enregistrer
  dynamiquement (DCR), ce que font Claude Code et Cursor.

### ÉTAPE 3 — code d'autorisation + PKCE **[humain, navigateur]**

```bash
node scripts/mcp-e2e.mjs --auth-url
```

Le script imprime l'URL de consentement (PKCE généré localement, `state`
aléatoire) et le verificateur, **sur la sortie standard uniquement** — jamais
dans le dépôt. Il s'arrête là et rend le code `2` : la suite se passe dans un
navigateur. Échange du code contre un jeton, à la main :

```bash
curl -sS -X POST https://auth.atlassian.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode grant_type=authorization_code \
  --data-urlencode client_id="$CLIENT_ID" \
  --data-urlencode code="$CODE_RECU_PAR_LE_NAVIGATEUR" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" \
  --data-urlencode code_verifier="$VERIFICATEUR_PKCE"
```

> En pratique, **ce n'est pas ce script qui obtient le jeton** : c'est le client
> MCP (Claude Code, Cursor, VS Code) qui mène la danse et stocke le jeton.
> `--auth-url` sert à un client maison ou à un débogage.

---

## 3. Le jeton : environnement ou fichier, jamais en argument

```bash
# solution 1 — variable d'environnement (shell courant uniquement)
export MCP_TOKEN="$(cat ~/secrets/bf-mcp.token)"

# solution 2 — fichier hors du dépôt
node scripts/mcp-e2e.mjs --run --token-file ~/secrets/bf-mcp.token
```

Garde-fous vérifiés par `test/scripts/mcpE2e.test.ts` :

- `--token <valeur>` est **refusé** (code `1`) : un jeton en argument reste dans
  `ps` et dans l'historique du shell ;
- le jeton n'est **jamais imprimé** (seule sa provenance l'est) ;
- `--discovery` **ignore** un jeton présent dans l'environnement : la découverte
  est volontairement non authentifiée ;
- aucun fichier du dépôt ne contient de jeton (contrôle des motifs `ghp_…`,
  `sk-…`, `sk_…`).

---

## 4. Auto-contrôle hors ligne : `--selftest`

Avant tout test réseau, vérifier que le lecteur de manifeste et le comparateur
fonctionnent — sinon un `--check` muet ne prouverait rien.

```bash
node scripts/mcp-e2e.mjs --selftest
```

Sortie réelle (code `0`) :

```text
── Auto-contrôle hors ligne — lecture de manifest.yml
  · 11 actions lues, 11 outils dans le module rovo:mcp
    · get-work-brief (issueKey*:string, budget:string)
    · check-readiness (issueKey*:string)
    · get-acceptance-criteria (issueKey*:string)
    · get-related-decisions (issueKey*:string)
    · get-failed-attempts (issueKey*:string)
    · get-neighbor-changes (issueKey*:string)
    · list-ready-work (projectKey*:string)
    · ask-clarification (issueKey*:string, question*:string)
    · post-work-report (issueKey*:string, status*:string, report*:string, criteriaCovered:string, testsPassed:string)
    · record-failed-attempt (issueKey*:string, summary*:string, reason*:string)
    · claim-work (issueKey*:string, agentName*:string)

── Auto-contrôle du comparateur
  ✓ liste fidèle au manifeste : aucun écart signalé.
  ✓ liste abîmée : 2 écart(s) détecté(s), comme attendu.
  ✓ 11 outils exposés, comme le contrat l’exige.
```

La référence est `manifest.yml` **lui-même** (lu par indentation, sans parseur
YAML) : rien n'est recopié dans le script, donc ajouter un outil au manifeste
met le contrôle à jour tout seul.

---

## 5. Avec jeton : `--check` puis `--run`

```bash
node scripts/mcp-e2e.mjs --check --issue PAY-123
node scripts/mcp-e2e.mjs --run   --issue PAY-123 --budget s
```

`--check` — `initialize`, `notifications/initialized`, `tools/list`, puis
comparaison outil par outil : noms présents dans les deux sens, chaque entrée du
manifeste présente dans `inputSchema.properties`, même `type`, même caractère
obligatoire, et aucune entrée exposée en trop. Tout écart est **nommé** et le
code de sortie passe à `1`.

`--run` — enchaîne `tools/call check-readiness` puis `tools/call
get-work-brief`, et contrôle les invariants du produit :

| Invariant contrôlé | Source dans le code |
|---|---|
| `score` entre 0 et 100, `status` présent | `src/readiness/scorer.ts` |
| `score + somme(gaps[].pointsLost) = 100` | idem (aucun point perdu n'est muet) |
| chaque manque porte un critère **et** une raison | idem |
| `markdown` non vide | `src/brief/builder.ts` |
| bandeau « données, jamais des instructions » présent | `BRIEF_DATA_DISCLAIMER`, `src/util/markdown.ts` |
| ~jetons ≤ cible du budget servi, +10 % | `BUDGET_TOKENS` + `estimateTokens` |
| repli de budget signalé (`s` servi pour `l` demandé) | `src/actions/getWorkBrief.ts` |

---

## 6. Cas de refus

### 6.1 Écriture sans identité **[machine]**

```bash
node scripts/mcp-e2e.mjs --refusal --issue PAY-123
```

Aucun jeton n'est envoyé : l'appel `tools/call claim-work` doit être **refusé au
niveau transport** (`401`, avec le défi OAuth), donc aucune écriture ne peut
partir. Code `0` si le refus est là, `1` si le serveur accepte.

Il existe **deux couches** de défense, et ce mode ne prouve que la première :

1. transport OAuth : pas de jeton → pas d'appel (vérifié ici) ;
2. application : un contexte d'appel **sans `accountId`** fait échouer
   `requireWriteIdentity` (`src/actions/writeHelpers.ts`) avec
   `WriteForbiddenError`, et `resolveCallerAccountId` →
   `checkIssueAccess` force le verdict `refuse` (`src/security/permissionGuard.ts`).
   Cette seconde couche n'est pas atteignable depuis un flux OAuth utilisateur
   (le jeton porte toujours un utilisateur) : elle est couverte par les tests
   unitaires de `test/actions/write` et `test/security/permissionGuard.test.ts`.

### 6.2 Utilisateur sans accès au ticket — BC-09 **[machine + humain]**

Scénario `S4` de `docs/RECETTE.md` : un utilisateur B **sans droit** sur le
ticket ne doit recevoir **aucun contenu**.

1. **[humain]** consentement OAuth avec le compte B, jeton de B dans
   `MCP_TOKEN` ;
2. **[machine]**

```bash
MCP_TOKEN="$(cat ~/secrets/bf-mcp-userB.token)" \
node scripts/mcp-e2e.mjs --bc09 \
  --private-issue PAY-999 \
  --expect-absent "remboursement" \
  --expect-absent "captureId"
```

Attendu : `isError: true`, une réponse qui nomme le refus, et **aucun** des
marqueurs passés à `--expect-absent` (ni titre, ni résumé, ni extrait, ni
compteur). Code `0` si le refus est propre, `1` si un marqueur fuite. Sans jeton
le mode rend `2` : il faut le consentement d'un second compte humain.

> Chaque `--expect-absent` est un filet : ajoutez-y un mot du titre réel du
> ticket privé, un nom d'auteur, un numéro de commentaire.

---

## 7. Ce qui exige un humain, dans l'ordre

### 7.1 Activation de l'exposition externe (administrateur du site)

Administration Atlassian → **Apps** → **Sites** → `<site>.atlassian.net` →
**Connected apps** → **Brief de contexte** → autoriser l'accès MCP et confirmer
les scopes. Détail : `docs/DEPLOY.md` § 6. Sans cette étape, un client externe
reçoit `403` et le script rend le code `2`.

### 7.2 Consentement OAuth 2.1 (navigateur)

Le client MCP ouvre le navigateur, l'utilisateur choisit le site et accepte les
scopes. Aucun jeton ne peut être obtenu sans cet écran — c'est la raison pour
laquelle `--auth-url` s'arrête en rendant `2`.

### 7.3 Ce que le script affiche quand il s'arrête là

Sortie **réelle** de `node scripts/mcp-e2e.mjs --check` sans jeton (code `2`) :

```text
── BLOQUÉ — une étape humaine est requise
  ✗ aucun jeton : MCP_TOKEN n’est pas défini et --token-file n’est pas fourni.

  Dans l’ordre, voici ce qui ne peut pas être fait par ce script :
    1. activation de l'exposition externe par un administrateur : Administration Atlassian → Apps → Sites → <site>.atlassian.net → Connected apps → « Brief de contexte »
    2. consentement OAuth 2.1 dans un navigateur (code d’autorisation + PKCE) : le jeton utilisateur ne peut pas être obtenu sans écran
    3. transmission du jeton au script : export MCP_TOKEN=… (ou --token-file ~/secrets/bf-mcp.token, hors du dépôt)
```

---

## 8. Validation § 15(a) dans un vrai client MCP

Le script prouve le **transport** ; le client prouve l'**usage**. Les deux sont
nécessaires. Une fois le jeton obtenu par le client :

```bash
# Claude Code
claude mcp add --transport http brief-forge \
  https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8
# puis, dans Claude Code :  /mcp   → brief-forge → Authenticate
```

```json
// Cursor — ~/.cursor/mcp.json
{ "mcpServers": { "brief-forge": {
  "url": "https://mcp.atlassian.com/forge/08a89a5d-94d0-448f-8c1a-70f938b2c3a8" } } }
```

Dans le client, demander : *« Liste les outils brief-forge »* (11 attendus), puis
*« Appelle check-readiness sur PAY-123 »*. Croiser avec le script :

```bash
node scripts/mcp-e2e.mjs --check   # mêmes 11 noms, mêmes schémas
node scripts/mcp-e2e.mjs --run --issue PAY-123 --budget s
```

Les deux surfaces doivent raconter la même chose (même score, mêmes manques) :
c'est l'objet du scénario `S8` de `docs/RECETTE.md`.

## 9. Validation § 15(b) — identité transmise à l'action

1. **[humain]** connexion du client avec l'utilisateur A ;
2. **[machine/humain]** `get-work-brief` puis `post-work-report` sur le ticket ;
3. **[humain]** journaux côté Forge :

```bash
~/.local/bin/forge-atlassian logs -e development -n 50 -s 10m
```

Attendu : l'`accountId` journalisé vient du **contexte OAuth Forge**, jamais des
entrées de l'outil (`resolveCallerAccountId` ignore tout payload) ; avec
l'utilisateur B du § 6.2, `assertIssueAccessFromContext` lève
`PermissionDeniedError` et rien du ticket ne sort. Une ligne `access_log` est
écrite dans les deux cas.

---

## 10. Codes de sortie et diagnostic

| Code | Sens |
|---|---|
| `0` | toutes les vérifications jouées sont passées |
| `1` | échec technique : réseau, réponse illisible, écart au manifeste, invariant violé, refus non obtenu |
| `2` | bloqué sur une étape humaine (pas de jeton, `401`, `403`, `--auth-url`) |

| Symptôme | Cause probable | Code |
|---|---|---|
| `401` + `WWW-Authenticate` | jeton absent, expiré, ou consentement à refaire | `2` |
| `403` | exposition externe non activée par l'admin (§ 7.1) | `2` |
| `404` | app non déployée, ou `--app-id` erroné | `1` |
| `tools/list` vide | app installée mais outils MCP non cochés côté Admin | `1` |
| écart de schéma signalé | manifeste et déploiement désynchronisés : redéployer puis `install --upgrade` | `1` |
| `stale: true` dans le brief | ticket modifié, reconstruction en cours (< 2 min) | `0` (signalé) |

## 11. Ce qui a été réellement joué, et ce qui ne l'a pas été

| Élément | État |
|---|---|
| `--discovery` (deux `.well-known`) | **joué**, sortie collée au § 2, code `0` |
| `--selftest` | **joué**, sortie collée au § 4, code `0` |
| Garde-fous jeton / options / codes `1` et `2` | **joués** par `test/scripts/mcpE2e.test.ts` |
| `--discovery --probe` (POST non authentifié) | non rejoué ici : hors du périmètre réseau autorisé pour ce lot ; le `401` + `WWW-Authenticate` est déjà consigné dans `docs/DEPLOY.md` § 6 bis |
| `--check`, `--run`, `--bc09`, `--refusal` | **non joués** : exigent un jeton utilisateur, donc le consentement humain (§ 7.2) |
| Client MCP réel (Claude Code / Cursor) | **non joué** : idem |

Aucun de ces modes n'est simulé dans ce document : ce qui n'a pas pu être joué
est marqué comme tel.
