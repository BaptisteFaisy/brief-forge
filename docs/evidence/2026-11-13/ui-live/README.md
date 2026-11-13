# Étape — l'interface en conditions réelles (panneau Jira et écran projet)

## Ce que ça prouve

L'interface est **rendue dans un vrai produit Atlassian**, sur le site de
démo, avec des données réelles — pas seulement dans les tests.

| Ce qui est capturé | Où | Ce qu'on voit |
|---|---|---|
| Panneau Jira, installation **production** | `panneau-jira-texte.txt` + capture `docs/captures/2026-11-13/panneau-jira-preparation.png` | « Brief d'agent — PAY-220 », score **39 / 100**, statut « Non prêt », le conseil actionnable, et les **4 manques** chiffrés (−30 critères d'acceptation, −15 périmètre, −10 composant, −6 objectif) |
| Badge de l'encart dans l'en-tête du ticket | capture `docs/captures/2026-11-13/panneau-jira-paysage.png` | « Préparation 39/100 » — la propriété dynamique de l'encart, calculée par l'app |
| Écran projet « Travail des agents » (KPI) | `ecran-kpi-texte.txt` + capture `docs/captures/2026-11-13/ecran-kpi-projet.png` | Les 3 indicateurs (avec « données insuffisantes » quand l'échantillon est trop petit), les **manques les plus fréquents** du projet, et les tickets **prêts** (PROJ-130 85/100, PROJ-129 75/100), **en cours** (PROJ-128 45/100, agent Claude Code v1.2) et **rendus** (PROJ-127 80/100, agent Cursor Agent ; PROJ-124 90/100, agent Aider agent) |

C'est la preuve live qui manquait aux items **03** (UI en UI Kit 2) et
**09** (KPI réels) : le tableau du 12 novembre les déclarait « prouvés par
tests seulement ».

### Ce que la capture a necessitated

L'encart affichait « Brief indisponible / Aucun score de préparation » sur
tout ticket. Deux raisons, cumulées :

1. **Forge SQL est cloisonné par installation.** L'app est installée en Jira
   et en Confluence, en `development` et en `production` : quatre
   installations, quatre bases. Les outils MCP peuvent router vers une
   installation différente de celle qui rend l'encart — donc un score
   calculé par un agent n'apparaît pas dans l'encart.

2. **L'encart ne savait rien faire de son propre stock.** Il ne faisait que
   *lire* une readiness déjà calculée ; sans ligne en base, il affichait une
   erreur.

L'encart calcule désormais le score **à la demande** quand il n'est pas
stocké (et le mémorise) : `src/index.ts`, fonction `readinessOuCalcul`, qui
réutilise `computeAndStore` de l'action `check-readiness` — pas de
duplication. C'est ce qui rend la capture possible, et c'est aussi ce qui
rend l'encart fiable : un panneau incapable de calculer ce qu'il affiche
n'est pas trustworthy.

## Ce que ça ne prouve pas

- **Que le brief s'affiche dans l'encart.** L'encart montre le score, le
  conseil et les manques ; la section « brief » dépend d'un brief **stocké**
  pour ce ticket dans cette installation. Sur PAY-220 il n'y en a pas (le
  drain ne construit un brief que pour les tickets dont le statut est
  « Prêt »), donc le bouton « brief » reste à ouvrir pour le voir.
- **Que l'interface est en français.** Les captures sont en anglais : le site
  de démo est en `EN`. L'application est bilingue (bascule `EN` visible dans
  l'écran projet), mais la bascule n'a pas été jouée.
- **Que les KPI sont justes.** L'écran affiche des données réelles, mais
  aucun contrôle indépendant n'a recalculé ces chiffres ; les tests unitaires
  restent la preuve de la formule.
- **Que l'interface est lisible au clavier ou conforme WCAG.** Aucun audit
  d'accessibilité n'a été fait.

## Rejouer

Les deux pages sont atteignables par leur URL (le format est donné par la
doc Atlassian : `/jira/{projectType}/projects/{projectKey}/apps/{appId}/{envId}`).

```text
https://one-atlas-cndz.atlassian.net/browse/PAY-220
https://one-atlas-cndz.atlassian.net/jira/software/projects/PAY/apps/08a89a5d-94d0-448f-8c1a-70f938b2c3a8/ab173a5a-5844-4dee-a987-aee077275ebf
```

L'identifiant d'environnement (`ab173a5a-…`) vient de
`forge-atlassian environments list` ; il change à chaque recréation
d'environnement.
