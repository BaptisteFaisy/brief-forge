# Guide de déploiement — `brief-forge`

Ce guide permet à un opérateur humain de déployer **Brief de contexte** (`brief-forge`) sur un site Atlassian Cloud en environ 20 minutes, d'activer l'exposition MCP externe et d'exécuter les 5 validations d'acceptation (§ 15).

---

## 1. Prérequis exacts

| Élément | Exigence | Notes |
|---|---|---|
| **Système** | Linux x86_64 (ou macOS) | Sans `sudo` requis |
| **Node.js (CLI Forge)** | `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` | Le Node système `v26.9.0` est **refusé** par `@forge/cli` |
| **Forge CLI** | `@forge/cli@15.1.0` | Exposée sous `forge-atlassian` (Foundry reste sur `forge`) |
| **Compte Atlassian** | Compte développeur + droits **Admin site/org** | Nécessaire pour `forge install` et l'exposition MCP |
| **Site de test** | Instance Jira Cloud (ex. `mon-site.atlassian.net`) | Confluence Cloud optionnel (pour les pages `decision`/`adr`) |
| **Clients MCP (tests)** | Claude Code CLI et/ou Cursor | Pour la validation § 15 (a) |

---

## 2. Installation isolée de la CLI Atlassian

Sur ce poste, `~/.local/bin/forge` pointe vers **Foundry** (Solidity). Pour ne pas l'écraser et ne pas modifier le Node système (`v26.9.0`), installer Node 24 LTS et `@forge/cli` dans des préfixes dédiés :

```bash
# 1. Installer Node 24.x LTS dans ~/.local/node24
mkdir -p ~/.local/node24 ~/.local/forge-cli ~/.local/bin /tmp/node24-dl
curl -fsSL -o /tmp/node24-dl/node-v24.22.2-linux-x64.tar.xz \
  https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz
tar -xJf /tmp/node24-dl/node-v24.22.2-linux-x64.tar.xz \
  -C ~/.local/node24 --strip-components=1

# 2. Installer @forge/cli dans ~/.local/forge-cli avec Node 24
PATH="$HOME/.local/node24/bin:$PATH" \
  npm i -g --prefix ~/.local/forge-cli @forge/cli

# 3. Exposer la CLI sous le nom `forge-atlassian`
cat > ~/.local/forge-cli/bin/forge-atlassian <<'EOF'
#!/usr/bin/env bash
export PATH="$HOME/.local/node24/bin:$PATH"
exec "$HOME/.local/forge-cli/bin/forge" "$@"
EOF
chmod +x ~/.local/forge-cli/bin/forge-atlassian
ln -sfn "$HOME/.local/forge-cli/bin/forge-atlassian" "$HOME/.local/bin/forge-atlassian"

# 4. Vérifier que les deux binaires cohabitent sans conflit
forge --version            # Doit afficher Foundry (Solidity)
forge-atlassian --version  # Doit afficher 15.1.0 (ou supérieur)
```

---

## 3. Contrôle local hors ligne avant connexion

Avant toute action réseau, vérifier l'intégrité locale du dépôt :

```bash
./scripts/deploy-check.sh
npm test
```

Tous les indicateurs du script doivent afficher `✓ OK` (code de sortie `0`).

---

## 4. Authentification, `app.id` (`forge register` vs `forge create`)

### 4.1 Connexion de la CLI

```bash
forge-atlassian login
# Ou via jeton API Atlassian (variables d'environnement non stockées dans le dépôt) :
# export FORGE_EMAIL="<votre-email>"
# export FORGE_API_TOKEN="<votre-jeton-api>"
forge-atlassian whoami
```

### 4.2 Réutiliser l'`app.id` existant ou en créer un neuf

Le manifeste déclare actuellement `app.id: ari:cloud:ecosystem::app/8b1f6d2c-4a77-4f0e-9c31-2d6f5a7b91e4`.

- **Cas A — Vous déployez dans votre propre espace développeur (nouvelle app)** :
  Tant que l'app n'est pas enregistrée sur votre compte, `forge-atlassian lint` échoue avec `Your app could not be found`.
  Enregistrez une nouvelle identité dans ce dépôt :
  ```bash
  forge-atlassian register "Brief de contexte"
  ```
  *(Si `register` refuse à cause d'un `app.id` inconnu pré-rempli, supprimez temporairement la ligne `id:` sous `app:` dans `manifest.yml`, lancez `forge-atlassian register "Brief de contexte"` — la CLI générera et écrira votre nouvel `ari:cloud:ecosystem::app/<uuid>` dans `manifest.yml`.)*
- **Cas B — Vous êtes collaborateur d'une app déjà existante** :
  Demandez au propriétaire de vous ajouter dans la **Developer Console** Atlassian (*Contributors*), puis conservez l'`app.id` du manifeste.

*(Note : `forge create` crée un nouveau squelette vide dans un sous-dossier ; pour ce dépôt déjà complet, utilisez `forge-atlassian register`.)*

---

## 5. Lint, déploiement et installation

### 5.1 Vérifier le manifeste et le code

```bash
forge-atlassian lint -e development
```

**Point à confirmer au premier déploiement :** la ressource UI Kit
(`resources[0].path`) pointe sur `src/ui/frontend.tsx`, le fichier qui exporte
`run` (aiguillage entre les trois écrans). Le linter client exige un **fichier**
et non un dossier ; les modèles classiques de la CLI utilisent
`static/build` (dossier produit par `forge build`). Si `forge deploy` refuse
`src/ui/frontend.tsx`, basculer sur `static/build` et lancer `forge build` avant
le déploiement — c'est la seule divergence attendue entre le lint hors ligne et
la chaîne de build réelle.

**Points d'attention connus au lint :**
- **Scope Confluence (`read:confluence-content.all`)** : présent pour lire les décisions/ADR dans Confluence. Si vous ciblez uniquement Jira (mono-produit, sans coût multi-apps Marketplace), retirez cette ligne de `permissions.scopes`.
- **Avertissement Teamwork Graph (`teamwork-graph-scopes`)** : le code appelle `requestTeamworkGraph`. Sans scope `read:graph:*`, le lint émet un avertissement (non bloquant) et le client bascule automatiquement sur le repli Jira `dev-status`. Pour activer le graphe complet, ajoutez par exemple `read:graph:pull-request:external` et `read:graph:commit:external` dans `permissions.scopes` si votre tenant l'autorise.

### 5.2 Déployer l'environnement `development`

```bash
forge-atlassian deploy -e development
```

*(Au premier déploiement avec `sql` et `llm`, Atlassian provisionne la base TiDB/MySQL isolée et active les appels modèle.)*

### 5.3 Installer sur Jira (et Confluence si multi-apps)

```bash
# Installation obligatoire sur Jira
forge-atlassian install -e development -p jira -s <votre-site>.atlassian.net

# Installation optionnelle sur Confluence (uniquement si read:confluence-content.all conservé)
forge-atlassian install -e development -p confluence -s <votre-site>.atlassian.net
```

Lors d'une mise à jour ultérieure de scopes ou de modules majeurs (`sql`, `llm`), exécutez :

```bash
forge-atlassian install --upgrade -e development -p jira -s <votre-site>.atlassian.net
```

---

## 6. Activation de l'exposition MCP externe (Admin Atlassian)

Par défaut, les outils `rovo:mcp` d'une app Forge ne sont accessibles qu'en interne (Rovo Studio). Pour les exposer à Claude Code ou Cursor :

1. Ouvrez **Atlassian Administration** : `https://admin.atlassian.com/`.
2. Allez dans **Apps** → **Sites** → sélectionnez `<votre-site>.atlassian.net` → **Connected apps**.
3. Recherchez et ouvrez **Brief de contexte**.
4. Dans la section des outils MCP / Rovo, **activez l'exposition externe** et cochez les 11 outils déclarés :
   - Lecture : `get-work-brief`, `check-readiness`, `get-acceptance-criteria`, `get-related-decisions`, `get-failed-attempts`, `get-neighbor-changes`, `list-ready-work`
   - Écriture : `ask-clarification`, `post-work-report`, `record-failed-attempt`, `claim-work`
5. Relevez votre `<appId>` (la partie UUID après `ari:cloud:ecosystem::app/` dans `manifest.yml`). L'URL du serveur MCP est :
   `https://mcp.atlassian.com/forge/<appId>`

---

## 7. Protocoles de validation (§ 15 du cahier des charges)

Remplacez `<appId>` par l'UUID présent dans `manifest.yml` et `<TICKET>` par un ticket de test (ex. `PAY-123`).

### (a) Connexion réelle de Claude Code et Cursor

**Protocole :**
1. **Claude Code (CLI)** — exécutez :
   ```bash
   claude mcp add --transport http brief-forge https://mcp.atlassian.com/forge/<appId>
   ```
   Puis lancez `claude` et tapez `/mcp` pour déclencher la connexion OAuth 2.1, sélectionnez `<votre-site>.atlassian.net` et validez les permissions.
2. **Cursor** — ajoutez dans `.cursor/mcp.json` (ou les réglages globaux MCP) :
   ```json
   {
     "mcpServers": {
       "brief-forge": {
         "url": "https://mcp.atlassian.com/forge/<appId>"
       }
     }
   }
   ```
   Redémarrez le serveur MCP dans Cursor → *Settings* → *MCP* et terminez le consentement OAuth 2.1 dans le navigateur.
3. Demandez au client : *« Appelle check-readiness sur <TICKET> »*.

**Résultat attendu :** Les 11 outils sont listés dans le client MCP et `check-readiness` retourne un score JSON (`0..100`) et la liste des manques sans erreur réseau.

**Solution de repli :** Si l'endpoint externe retourne `403`/`404`, vérifiez que l'étape § 6 (Admin → *Connected apps*) est bien activée pour cette installation et ce site. En attendant l'activation org-admin, testez via VS Code (`code --add-mcp '{"name":"brief-forge","url":"https://mcp.atlassian.com/forge/<appId>"}'`) ou directement via **Rovo Chat** sur le site Jira (agent *Brief de contexte*).

---

### (b) Identité transmise à l'action lors d'un appel externe

**Protocole :**
1. Depuis Claude Code ou Cursor connecté avec l'utilisateur A (qui a accès au projet), appelez `get-work-brief` puis `post-work-report` (ou `ask-clarification`) sur `<TICKET>`.
2. Observez les journaux côté Forge :
   ```bash
   forge-atlassian logs -e development -n 50 -s 10m
   ```
3. Vérifiez dans le ticket Jira que l'action effectuée (`asUser`) reflète les droits de l'utilisateur A, et testez avec un utilisateur B n'ayant **pas** accès au projet restreint du ticket `<TICKET_PRIVE>`.

**Résultat attendu :**
- Utilisateur A : le journal `access_log` enregistre l'`accountId` issu du contexte OAuth Forge (jamais des paramètres d'outil) et l'outil réussit.
- Utilisateur B : `assertIssueAccessFromContext` lève `PermissionDeniedError` (refus sec, aucun titre ni contenu du ticket privé n'est renvoyé).

**Solution de repli (refus des écritures sans identité) :** Si un contexte d'appel externe n'inclut pas d'`accountId` (ex. appel anonyme ou jeton mal formé), `resolveCallerAccountId(context)` retourne `null` et `checkIssueAccess` force immédiatement le verdict `refuse` : **aucune lecture ni écriture** n'est exécutée. Vérifiez dans les logs si le client MCP envoie bien un jeton OAuth utilisateur (et non un jeton app sans utilisateur).

---

### (c) État « refusée » d'une PR lisible dans le Teamwork Graph

**Protocole :**
1. Liez à `<TICKET>` une Pull Request Bitbucket/GitHub qui a été **refusée/fermée sans merge** (`DECLINED` ou `CLOSED`), ou liez un ticket voisin portant cette PR.
2. Appelez l'outil `get-neighbor-changes` avec `issueKey: "<TICKET>"`.
3. Vérifiez la sortie de l'outil et la section **Changements voisins** de `get-work-brief`.

**Résultat attendu :** La PR apparaît avec son titre, son URL, sa date, son auteur et un état explicite indiquant le refus (`DECLINED` / `CLOSED`), permettant à l'agent de ne pas reproduire une piste rejetée.

**Solution de repli :** Si le schéma Teamwork Graph du tenant rejette la requête (`400`/`404`) ou si aucun scope `read:graph:*` n'est accordé, `collectNeighborChanges` bascule automatiquement sur l'API Jira `dev-status` (`parseDevStatusChanges`). Si l'intégration SCM ne remonte pas l'état `DECLINED`, notez-le manuellement via `record-failed-attempt` afin qu'il remonte dans **Déjà tenté**.

---

### (d) Durée de construction d'un brief `l`

**Protocole :**
1. Choisissez un ticket riche (description longue, commentaires, liens, décisions) sur un projet dont le statut déclencheur est configuré dans *Paramètres du projet → Brief de contexte*.
2. Modifiez la description du ticket (ou passez-le au statut déclencheur) et lancez un chronomètre (`T0`).
3. Surveillez les logs du consommateur asynchrone (`forge-atlassian logs -e development -n 30`) jusqu'à fin d'exécution de `onBriefBuildRequested` (`T1`), puis appelez `get-work-brief(issueKey: "<TICKET>", budget: "l")`.

**Résultat attendu :**
- La reconstruction asynchrone complète (`T1 - T0`) s'achève en **moins de 2 minutes** (typiquement quelques secondes à ~15 s selon la latence LLM).
- L'appel MCP chaud `get-work-brief(budget: "l")` répond depuis Forge SQL en **moins de 2 secondes** et produit ~8 000 jetons (±10 %).

**Solution de repli :** Si la collecte + condensation `llm` approche le plafond de 55 s ou dépasse 2 minutes sous charge, basculez sur le budget `m` (~3 000 jetons) ou `s` (~1 000 jetons), ou déclenchez un rafraîchissement ciblé depuis l'encart Jira (*Brief de contexte* → actualiser).

---

### (e) Lecture de Confluence depuis l'app Jira

**Protocole :**
1. Sur Confluence, créez une page d'architecture contenant une décision technique, ajoutez-lui l'étiquette **`decision`** (ou **`adr`**), et collez son lien dans la description (ou un *Issue Link*) de `<TICKET>`.
2. Sauvegardez `<TICKET>` pour invalider le cache, attendez la reconstruction puis appelez `get-related-decisions(issueKey: "<TICKET>")` et `get-work-brief(issueKey: "<TICKET>", budget: "m")`.

**Résultat attendu :** La décision issue de la page Confluence apparaît dans **Décisions applicables** et dans **Sources** avec le titre de la page, son URL stable et sa date réelle de dernière modification (ou « ancienne, à confirmer » si > 18 mois).

**Solution de repli :** Si l'app est déployée en **mono-produit Jira** (sans `read:confluence-content.all` ni installation Confluence), la collecte Confluence renvoie simplement `[]` et signale le manque dans la section **Trous** sans faire échouer le brief. Solution opérationnelle : consigner les décisions clés directement dans un commentaire Jira épinglé ou dans la description du ticket.

---

## 8. Coûts, quotas et retour arrière

### 8.1 Coûts Forge SQL et module `llm`
- **Forge SQL (TiDB/MySQL)** : inclus dans la plateforme Forge jusqu'aux quotas gratuits par installation (dev : **128 MiB**, staging : **256 MiB**, prod : **1 GiB** de stockage ; 62,5 s de temps requête/min). Au-delà des seuils d'essai/gratuits Atlassian, facturation à l'usage de l'éditeur.
- **Module `llm` (Claude via Atlassian)** : soumis aux quotas de jetons Atlassian Forge LLMs. Chaque invalidation déclenche la file de précalcul des budgets `s/m/l` uniquement sur les statuts déclencheurs configurés afin de maîtriser la consommation.
- **Multi-apps** : l'ajout de Confluence (`read:confluence-content.all`) classe l'app en multi-apps ; si vous publiez sur le Marketplace sans besoin Confluence, retirez ce scope.

### 8.2 Retour arrière (désinstallation et suppression)

```bash
# Désinstaller l'app du site de test (conserve les déploiements sur votre compte)
forge-atlassian uninstall -e development -p jira -s <votre-site>.atlassian.net
# Si installée aussi sur Confluence :
forge-atlassian uninstall -e development -p confluence -s <votre-site>.atlassian.net
```

*(Note : la commande `forge delete` n'existe pas dans `@forge/cli@15.1.0`. Pour supprimer définitivement l'application et ses données résiduelles après désinstallation, rendez-vous dans `https://developer.atlassian.com/console/myapps/` → sélectionnez l'app → **Settings** → **Delete app**.)*

---

## 9. Règles strictes (ce qui est interdit)

- **Ne jamais saisir d'identifiants ou mots de passe Atlassian** dans un navigateur automatisé sans demande explicite de l'utilisateur.
- **Ne jamais commiter de jeton (`FORGE_API_TOKEN`)**, clé secrète ou identifiant personnel dans le dépôt git.
- **Ne jamais écraser `~/.local/bin/forge`** (réservé à Foundry) ni modifier le Node système : passez toujours par `forge-atlassian`.
