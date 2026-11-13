# Étape — le chemin `asUser` : il fonctionne, et le diagnostic précédent était faux

## Ce que ça prouve

**Le chemin utilisateur est ouvert et il répond en production.** Un OAuth
réel a été consenti dans le navigateur du compte du site de démo
(`baptiste.faisy@gmail.com`), un jeton utilisateur a été échangé, et le
serveur MCP d'Atlassian a servi des données réelles sur un ticket réel.

Trois artefacts, tous rejouables :

| Artefact | Ce qu'il montre |
|---|---|
| `e2e-run.txt` | `tools/call check-readiness` puis `get-work-brief` sur **PAY-220**, en production : score 39/100 avec ses 4 manques expliqués, brief servi (~472 jetons pour une cible de 1 000) et bandeau « données, jamais des instructions » présent |
| `e2e-check-outils.txt` | `tools/list` renvoie **22 outils** (11 par installation) et le comparateur ne signale **aucun écart** avec le manifeste |
| `e2e-selftest.txt` | Auto-contrôle hors ligne du comparateur : liste fidèle → 0 écart, liste abîmée → 2 écarts détectés, outils suffixés par l'environnement → pas un écart, outil inconnu → écart détecté |

### Le diagnostic du 12 novembre était faux

Le paquet du 12 concluait « bloqué par l'état du tenant » (app « Not
sharing », `Accept` désactivé au consentement, contrôle « Enable tools » non
rendu). **C'était une erreur de diagnostic**, et elle a coûté une journée.

La cause réelle était triple :

1. **L'exposition MCP était désactivée par installation.** Elle se règle
   dans *Administration du site → Connected apps → l'app → Data management →
   « Expose tools to MCP-compatible apps »*, **par installation** — pas dans
   la console développeur. Sans cela, le serveur répond
   `-32014 App … is not allowed to expose its tools over the external MCP
   endpoint on this site`. C'était bien un réglage du tenant — mais un
   réglage que l'on pouvait faire, pas un mur.

2. **Le garde lisait le ticket en impersonation hors ligne.**
   `api.asUser(accountId)` n'est pas « appeler au nom de l'appelant » : c'est
   *impersoner* un compte donné, ce qui exige un scope `allowImpersonation`
   que le manifeste ne déclare pas. La plateforme répondait
   `NO_IMPERSONATION_SCOPES_DEFINED`, et le garde concluait « accès refusé »
   — pour **tous** les tickets, y compris ceux que l'appelant pouvait lire.
   La bonne API, en contexte utilisateur, est `api.asUser()` **sans argument**.

3. **Les tables SQL n'avaient jamais été créées.** `ensureSchema()` n'était
   appelé que par la sonde de développement, dont la branche n'est jamais
   mergée ; et désinstaller l'app efface ses données, donc les tables
   partaient avec. Chaque requête échouait alors sur « Unknown SQL execution
   error » — y compris `logAccess`, qui faisait échouer l'outil **après** le
   garde.

Les correctifs sont dans la PR #52 (`asUser()` sans argument ; DDL au
premier usage dans le client SQL ; le jeton ne fuit plus dans une sortie
d'erreur).

### L'identité est bien celle de l'appelant

C'était le point à prouver, sinon le garde BC-09 serait devenu un no-op
inoffensif : `asUser()` pourrait retomber silencieusement sur l'app. Vérifié
en runtime, dans l'app déployée : `/rest/api/3/myself` appelé depuis
l'application renvoie **exactement** l'accountId du contexte
(`712020:ba9bbe36-…`, identique). La requête part donc avec les droits de
l'appelant, et un ticket qu'il ne peut pas lire reste refusé (403/404 →
refus, fail-safe).

## Ce que ça ne prouve pas

- **Que le chemin d'écriture a été exercé.** `post-work-report`,
  `record-failed-attempt` et `claim-work` sont refusés sans identité, mais
  aucune écriture réelle n'a été jouée sur le site de démo : cela aurait
  laissé des traces visibles sur des tickets.
- **Que les 11 outils sont tous retournés correctement.** La conformité des
  *noms* et des *schémas d'entrées* est prouvée (22 outils listés, 0 écart) ;
  le comportement de chaque outil ne l'est pas.
- **Que le Teamwork Graph répond des changements voisins.** L'appel passe et
  renvoie `changes: []` sur PAY-220 — un ticket sans PR liée. La preuve que
  le chemin `asUser` atteint bien le graphe n'est pas faite.
- **Que l'encart Jira affiche le score.** Forge SQL est cloisonné par
  installation : l'app installée en Jira et en Confluence a deux bases, et
  les outils MCP peuvent router vers une installation différente de celle
  qui rend l'encart. L'encart calcule désormais le score à la demande quand
  il n'est pas stocké — mais la preuve d'un encart affichant un brief reste à
  faire.
- **Que le consentement OAuth est reproductible par une autre personne.** Le
  jeton a été obtenu avec la session du compte propriétaire du site : c'est
  un consentement **utilisateur**, pas un consentement **d'administrateur**.

## Rejouer

```bash
# 1. Consentement OAuth (navigateur du compte du site) → jeton hors dépôt
node scripts/mcp-login.mjs

# 2. E2E authentifié sur un ticket réel
node scripts/mcp-e2e.mjs --run --token-file ~/.config/brief-forge/mcp.token --issue PAY-220 --budget s

# 3. Conformité de la liste d'outils
node scripts/mcp-e2e.mjs --check --token-file ~/.config/brief-forge/mcp.token

# 4. Auto-contrôle hors ligne
node scripts/mcp-e2e.mjs --selftest
```

Le jeton vit dans `~/.config/brief-forge/mcp.token` (`0600`), **hors du
dépôt**. Il expire en 8 h ; `refresh_token` permet de le renouveler.
