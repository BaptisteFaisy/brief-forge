# Étape — déploiement de `staging` et `production`

## Ce que ça prouve

`main` (le code des dix items) est déployé sur les **trois** environnements, et
l'installation de **production** du site de démonstration est à jour.

| Environnement | Version | Éligibilité RoA | Installée sur le site de démo |
|---|---|---|---|
| `development` | 5.5.0 | ✓ | oui |
| `staging` | 2.0.0 | ✓ | **non** (`Could not find an installation`) |
| `production` | 3.0.0 | ✓ | **oui**, scopes supplémentaires consentis (`Upgrade complete!`) |

Versions et dernières marques horaires : `environnements-apres.txt`.

L'installation de production (`install-production.txt`) rend explicite
l'approbation de la montée de version majeure : *« Your app will be upgraded
with the following additional scopes »* puis `✔ Upgrade complete!` — ce sont les
6 scopes `read:graph:*` posés par la PR #38, consentis sur le site par
l'administrateur.

Les déploiements eux-mêmes (`deploy-staging.txt`, `deploy-production.txt`)
portent chacun *« Deployed … with 1 approval acknowledged »* et le verdict
d'éligibilité *Runs on Atlassian* de la version déployée.

## Rejouer

```bash
forge-atlassian deploy -e staging  --non-interactive --approve MAJOR_VERSION_RULE
forge-atlassian deploy -e production --non-interactive --approve MAJOR_VERSION_RULE
forge-atlassian install --upgrade -e production -p jira \
  -s one-atlas-cndz.atlassian.net --non-interactive --confirm-scopes
```

## La production tourne-t-elle bien le code de `main` ?

Oui, et c'est vérifiable : entre le SHA déployé (`60892bd`, celui qu'indiquent les
artefacts) et `main` après les deux derniers commits, le diff **applicatif**
(`src/`, `manifest.yml`, `package.json`) est **vide** :

```
$ git diff --stat 60892bd main -- src/ manifest.yml package.json
(rien)
```

Ces deux commits n'ont touché que la documentation, le paquet de preuves et le
workflow de CI. L'app installée sur le site de démo est donc bien la version
finale.

## État final des trois environnements

`development` a été redéployé sur le `main` final après la fusion du paquet de
preuves, pour que les trois environnements tournent **le même code
applicatif** — seuls leurs numéros de version diffèrent, comme le veut Forge
(`environnements-final.txt`).

| Environnement | Version déployée | Code applicatif | Éligibilité RoA |
|---|---|---|---|
| `development` | 5.6.0 | `main` final | ✓ |
| `staging` | 2.0.0 | identique (diff vide) | ✓ |
| `production` | 3.0.0 | identique (diff vide) | ✓ |

## Ce que ça ne prouve pas

- **L'appel d'outil « en tant qu'utilisateur » (BC-09 / `asUser`) n'a pas été
  joué.** Le flux OAuth a été préparé (`scripts/mcp-login.mjs` : enregistrement
  dynamique de client + PKCE + échange de code), mais le **consentement humain
  n'a pas eu lieu au moment de la capture** : c'est l'unique point où la preuve
  attend un clic dans un navigateur, hors de portée de l'automatisation.
- **Les logs de production sont illisibles** : Atlassian interdit `forge logs`
  sur l'environnement `production`. La preuve ne peut donc venir que de
  l'extérieur (MCP authentifié, écran Jira), pas des logs.
- **Le rendu visuel de l'écran Jira** n'est pas capturé (pas de session
  automate sur le site de démonstration) — les tests prouvent la construction
  de l'arbre React, pas l'écran rendu.
- `staging` n'est **pas installé** sur ce site : c'est un environnement de
  déploiement, pas une installation visible par les utilisateurs du site. Le
  fait est consigné tel quel, pas contourné.

## À faire quand le consentement sera possible

1. `node scripts/mcp-login.mjs` — ouvrir l'URL, accepter ;
2. `node scripts/mcp-e2e.mjs --run --token-file ~/.config/brief-forge/mcp.token`
   — `initialize → tools/list → check-readiness → get-work-brief`, en tant
   qu'utilisateur, sur l'installation de production ;
3. capturer la sortie ici même, comme artefact.

C'est le chemin qui validera, en une fois : l'identité transmise (BC-09), le
déclenchement réel du brief, et le Teamwork Graph en `asUser` (le 403 « voisins :
Accès refusé » de la sonde `asApp` devrait disparaître).