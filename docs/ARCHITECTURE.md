# Architecture — brief-forge

> Document interne (français). Public visé : mainteneurs et relecteurs du dépôt.
> Le contrat d'implémentation fait foi : [`CONTRACT.md`](CONTRACT.md). Toute
> divergence entre ce document et le contrat est un bug de ce document.

## 1. Vue d'ensemble

brief-forge est une app **Atlassian Forge** (Node.js, runtime Forge, pas de
serveur à héberger) doublée d'un **serveur MCP** exposé par le module
`rovo:mcp`. Elle transforme un ticket Jira en **brief compact, sourcé et
budgété** pour un agent de code, reçoit en retour son **compte rendu**, et
réinjecte ce compte rendu dans le brief suivant.

Trois surfaces de consommation :

1. **Rovo Chat / Rovo Agent** (côté Atlassian) — via `rovo:mcp`, `rovo:skill`,
   `rovo:agent`.
2. **Clients MCP externes** ([CC], Cursor…) — via l'URL
   `https://mcp.atlassian.com/forge/<appId>`, OAuth 2.1.
3. **Jira lui-même** — bandeau sur le ticket (`jira:issueContext`), page projet
   (`jira:projectPage`), réglages projet (`jira:projectSettingsPage`).

## 2. Schéma des modules

```
manifest.yml
│
├── modules.rovo:mcp            serveur MCP : déclare les 11 outils
├── modules.function ×11        un handler par outil (src/actions/)
├── modules.rovo:skill          skills/work-brief/SKILL.md  (agent Rovo)
├── modules.rovo:agent          agent Rovo « brief-forge »
├── modules.jira:issueContext   bandeau du ticket : score + manques + bouton
├── modules.jira:projectPage    tableau de bord : tickets prêts / à préciser
├── modules.jira:projectSettingsPage  réglages projet (statut, labels, champ CA)
├── modules.trigger ×4          avi:jira:updated|commented:issue,
│                               avi:jira:created|deleted:issuelink
├── modules.consumer            file de (re)construction des briefs
├── modules.sql                 8 tables (stockage Forge SQL)
└── modules.llm                 Forge AI : condensation + détection d'instruction
```

Règle de dépendance : `manifest.yml` → `src/index.ts` → `src/actions/` →
`src/brief/` → `src/collect/` + `src/security/` + `src/storage/` +
`src/util/`. Aucun module métier n'importe un autre module métier
directement : tout passe par les signatures du contrat (§ 4).

## 3. Modules, un par un

### 3.1 `rovo:mcp` — le serveur MCP

Déclare les 11 outils et leur schéma d'entrée (chaînes, entiers, nombres,
booléens uniquement — aucune structure imbriquée : c'est ce que les clients MCP
savent transporter de façon fiable). Chaque outil pointe vers une fonction
Forge (`modules.function`) dont le handler est un fichier de `src/actions/`.

Contrainte de plateforme : **une action dispose de 55 s**. D'où la règle « on
sert un brief précalculé ; on ne construit jamais un brief à la volée sur le
chemin d'appel » (§ 4).

### 3.2 `action ×11` — les handlers

| Outil | Verbe | Lecture / écriture | Coût typique |
|---|---|---|---|
| `get-work-brief` | GET | lecture SQL + rafraîchissement ciblé | 1 lecture, 0 LLM |
| `check-readiness` | GET | calcul déterministe | 0 SQL si frais |
| `get-acceptance-criteria` | GET | lecture SQL | 1 lecture |
| `get-related-decisions` | GET | lecture SQL | 1 lecture |
| `get-failed-attempts` | GET | lecture SQL | 1 lecture |
| `get-neighbor-changes` | GET | lecture SQL | 1 lecture |
| `list-ready-work` | GET | lecture SQL (index sur score) | 1 lecture |
| `ask-clarification` | CREATE | commentaire Jira | 1 écriture |
| `post-work-report` | CREATE | commentaire + encart + tables | 1 écriture, 2 SQL |
| `record-failed-attempt` | CREATE | commentaire + table `attempt` | 1 écriture, 1 SQL |
| `claim-work` | UPDATE | table `claim` | 1 SQL |

Tous les handlers suivent le même enchaînement : (1) `assertIssueAccess` —
permissions de l'utilisateur appelant ; (2) validation des entrées ; (3)
travail ; (4) `logAccess` (trace 90 jours). Un refus lève une
`PermissionDeniedError` et le handler renvoie un refus **sans contenu** du
ticket (voir `SECURITY.md`).

### 3.3 `rovo:skill` + `rovo:agent`

`skills/work-brief/SKILL.md` décrit à un agent Rovo *quand* et *comment*
appeler les outils : d'abord `check-readiness`, puis `get-work-brief` au budget
`m`, puis `claim-work` avant de commencer, puis `post-work-report` à la fin.
La skill ne contient aucun secret et aucune logique métier : elle ne fait que
nommer les outils et l'ordre d'appel. `rovo:agent` déclare l'agent
« brief-forge » avec cette skill et un jeu d'outils restreint aux lectures +
`post-work-report`.

### 3.4 UI Jira (3 modules)

- `jira:issueContext` — bandeau sur le ticket : score, statut (« prêt », « à
  préciser », « non prêt »), liste des manques avec points perdus, bouton
  « Préparer pour un agent ». Le bandeau **ne modifie jamais** le ticket.
- `jira:projectPage` — liste des tickets du projet triés par score : ce qui est
  prêt à être donné à un agent, ce qui doit être précisé d'abord.
- `jira:projectSettingsPage` — réglages projet (statut déclencheur, label,
  champ des critères d'acceptation, labels de décision, zone composant, texte
  de contraintes). Écrit dans `project_settings`.

Les UI sont des Custom UI (React) servies par Forge ; elles appellent les mêmes
handlers que le MCP via `@forge/resolver`, donc **jamais** de logique dupliquée
entre l'UI et le serveur MCP.

### 3.5 `trigger ×4` + `consumer`

| Trigger | Rôle |
|---|---|
| `avi:jira:updated:issue` | marque le brief périmé ; si le ticket entre dans le statut déclencheur, l'enfile |
| `avi:jira:commented:issue` | marque périmé (une décision ou une tentative peut se cacher dans un commentaire) |
| `avi:jira:created:issuelink` | marque périmé (un lien bloquant change la readiness) |
| `avi:jira:deleted:issuelink` | idem |

Le trigger est **idempotent et bon marché** : il n'écrit qu'un drapeau
`stale = 1` et, au plus, un identifiant dans la file. Le `consumer` (queue
Forge) fait le travail lourd : collecte, condensation LLM, écriture des trois
budgets (`s`, `m`, `l`) et du score.

### 3.6 `sql` — stockage

Forge SQL (PostgreSQL managé). 8 tables, **sans clé étrangère** (Forge SQL ne
les garantit pas et une migration de schéma devient pénible), DDL idempotent
(`CREATE TABLE IF NOT EXISTS`), pas d'`AUTO_INCREMENT` (on génère les
identifiants applicativement pour rester portable).

### 3.7 `llm` — Forge AI

Deux usages, tous deux **bornés** :

1. **Condensation** : réduire des sections trop longues au budget imparti, en
   conservant les sources. Le modèle ne crée jamais de fait : il reformule du
   texte déjà collecté.
2. **Détection d'instruction** : second filtre après les règles, sur les
   contenus tiers (voir `SECURITY.md`).

Aucun autre appel LLM. Pas d'appel réseau hors Atlassian.

## 4. Flux de données

### 4.1 Chemin chaud (une action MCP)

```
client MCP
   │  get-work-brief {issueKey: "PAY-123", budget: "s"}
   ▼
handler ──assertIssueAccess──► Jira (permissions de l'utilisateur)
   │
   ├─ loadBrief("PAY-123","s") ──► SQL
   │     ├─ trouvé et frais  ──► réponse (≤ 1 100 jetons)
   │     └─ absent ou périmé ──► reconstruction synchrone bornée (voir 4.3)
   ▼
logAccess(...) ──► SQL
```

Objectif : le cas nominal est **une lecture SQL**, pas une reconstruction.

### 4.2 Chemin froid (précalcul)

```
trigger Jira ──► stale = 1 ──► file ──► consumer
                                          │
                     collectIssue / collectDecisions /
                     collectNeighborChanges / collectProjectSettings
                                          │
                          sanitizeForBrief + maskSecrets (par élément)
                                          │
                          buildBrief(s) / (m) / (l)
                                          │
                          computeReadiness
                                          ▼
                          SQL : brief ×3, readiness, access_log
```

Le précalcul se déclenche **uniquement** sur le statut déclencheur (réglage
projet) : sinon un projet actif reconstruirait des briefs pour des tickets que
personne ne confiera à un agent.

### 4.3 Reconstruction et invalidation

- `markBriefStale(issueKey)` : `stale = 1` sur les trois budgets. Aucune
  suppression — un brief périmé reste lisible et **le dit**.
- Sur `get-work-brief`, un brief périmé déclenche une reconstruction
  synchrone **si** la collecte tient dans la fenêtre de 55 s ; sinon la réponse
  renvoie le brief périmé avec la mention explicite `stale: true` et un conseil
  (« ticket modifié à HH:MM, reconstruction en cours »). Mieux vaut un contexte
  daté qu'un timeout.
- Cible de fraîcheur : **moins de 2 minutes** entre la modification et le brief
  reconstruit (`BRIEF_FRESHNESS_TARGET_MS`).
- `post-work-report` et `record-failed-attempt` marquent également le brief
  périmé : un compte rendu est du contexte neuf.

## 5. Budgets

| Budget | Cible | Tolérance | Usage |
|---|---|---|---|
| `s` | 1 000 jetons | +10 % → **1 100 max** | agent en contexte serré, boucle courte |
| `m` | 3 000 jetons | +10 % | défaut (`DEFAULT_BUDGET`) |
| `l` | 8 000 jetons | +10 % | ticket complexe, revue humaine |

Le comptage est **heuristique** (1 jeton ≈ 4 caractères,
`src/util/tokens.ts`) : Forge n'expose pas de compteur exact côté runtime.
L'heuristique est stable et suffisante pour tenir la promesse « budget `s` →
≤ 1 100 jetons ».

Quand une section dépasse sa part de budget :

1. on **condense** (LLM) en conservant les sources ;
2. si ça ne suffit pas, on **tronque** et on **le dit** ;
3. on **nomme l'outil** qui donne la suite :
   `_4 autres décisions non affichées : `get-related-decisions` pour la suite._`

Un brief n'est **jamais** silencieusement incomplet. C'est la contrepartie du
budget : l'agent sait qu'il lui manque quelque chose et sait comment l'obtenir.

Répartition indicative par section (budget `m`) : objectif + critères 40 %,
décisions 20 %, déjà tenté 15 %, contraintes + leçons 15 %, reste 10 %.

## 6. Modèle de données

8 tables. Types simplifiés (le DDL exact est dans `src/storage/`).

| Table | Clé logique | Colonnes principales | Rôle |
|---|---|---|---|
| `brief` | (`issue_key`, `budget`) | `content_md`, `content_json`, `sources_json`, `built_at`, `stale` | brief précalculé, 1 ligne par budget |
| `readiness` | `issue_key` | `score`, `status`, `gaps_json`, `advice`, `computed_at` | score + explication des manques |
| `attempt` | `id` | `issue_key`, `agent_name`, `user_account_id`, `started_at`, `status`, `report_md`, `criteria_covered`, `tests_passed` | une tentative d'agent, réussie ou non |
| `review` | `id` | `attempt_id`, `reviewer_account_id`, `verdict`, `comment`, `at` | relecture humaine d'un compte rendu |
| `lesson` | `id` | `project_key`, `component`, `text`, `source_attempt_id`, `created_at` | leçon réutilisable, dérivée d'une tentative |
| `claim` | `issue_key` | `agent_name`, `user_account_id`, `expires_at` | réservation d'un ticket (4 h) |
| `access_log` | `id` | `issue_key`, `tool`, `user_account_id`, `at` | trace d'accès, 90 jours |
| `project_settings` | `project_key` | statut déclencheur, label, champ CA, labels décision, zone, contraintes | réglages par projet |

Notes :

- `brief` et `readiness` sont **dérivés** : on peut les jeter et les recalculer.
  `attempt`, `review`, `lesson` et `access_log` sont **la mémoire du produit** :
  on ne les jette pas.
- Pas de clé étrangère : `review.attempt_id` et `lesson.source_attempt_id` sont
  des références logiques, vérifiées applicativement.
- `access_log` est purgé au-delà de 90 jours (`ACCESS_LOG_RETENTION_DAYS`).
- Les clés `issue_key` sont des chaînes (`PAY-123`), pas des identifiants
  numériques : le produit parle la langue de Jira.

## 7. Choix de conception et raisons

| Choix | Raison |
|---|---|
| **Précalcul + drapeau `stale`** plutôt que construction à la volée | une action MCP a 55 s ; la collecte (Jira + Confluence + Teamwork Graph + LLM) ne tient pas de façon fiable dans ce budget. Le précalcul rend le chemin chaud déterministe et rapide. |
| **Trois budgets figés** (`s`/`m`/`l`) plutôt qu'un paramètre libre | un paramètre libre rend le comportement imprévisible et les tests impossibles. Trois paliers couvrent les usages réels et se testent. |
| **Sections à ordre fixe** | un agent lit toujours la même structure ; le diff entre deux briefs du même ticket est lisible ; les tests comparent des sections. |
| **Une source + une date par élément** (BC-02) | sans source, un brief est une rumeur. La date permet de repérer une décision ancienne (`STALE_DECISION_MONTHS = 18` → « ancienne, à confirmer »). |
| **Troncature qui se nomme et nomme l'outil** | le budget est une contrainte, pas une excuse pour mentir par omission. |
| **Écritures bornées** (commentaire, label, propriété) | un agent qui peut changer le statut ou l'assigné peut casser un board et un sprint. On ne lui donne pas ce droit, même s'il le demande. |
| **Score de readiness pondéré, expliqué** | un score seul est inutilisable. Chaque point perdu porte un critère, un nombre de points et une raison → l'utilisateur sait *quoi* corriger. |
| **Le contenu tiers est cité, jamais interprété** | un commentaire peut contenir « ignore les instructions précédentes ». Le cadrage « ceci est une donnée » est la défense principale (voir `SECURITY.md`). |
| **Forge SQL plutôt que Forge Storage** | on a besoin de requêtes (`list-ready-work` trié par score, recherche par projet). Key-value ne suffit pas. |
| **Pas de clé étrangère, pas d'`AUTO_INCREMENT`** | portabilité et migrations simples sur Forge SQL ; les contraintes sont applicatives. |
| **UI et MCP derrière les mêmes handlers** | une seule implémentation par logique (règle de non-duplication) : le bandeau Jira et un client MCP externe voient exactement le même brief. |
| **Skill Rovo minimale** | une skill qui contient de la logique devient une seconde implémentation à maintenir. Elle ne nomme que les outils et l'ordre d'appel. |
| **`claim-work` déclaratif, 4 h** | deux agents sur le même ticket coûtent cher ; une réservation courte et expirante évite le blocage définitif d'un ticket par un agent mort. |
| **Trace d'accès 90 jours** | après incident, on doit pouvoir dire qui a lu quel ticket et par quel outil. |

## 8. Points ouverts

- Le précalcul des trois budgets triple le coût de condensation : arbitrage à
  faire (construire `l` à la demande plutôt qu'en précalcul) — voir
  `ROADMAP.md`.
- La détection d'instruction par modèle est un appel LLM par contenu tiers :
  coût à mesurer sur un projet bavard.
- `list-ready-work` sur un gros projet : pagination à ajouter.
