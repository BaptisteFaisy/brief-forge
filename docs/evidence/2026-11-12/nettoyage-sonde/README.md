# Étape — démontage de la sonde de développement

## Ce que ça prouve

La sonde a servi à mesurer la fidélité sur des tickets réels. Une fois la mesure
faite, elle a été **entièrement retirée** — trois vérifications, pas une
déclaration :

| Vérification | Preuve |
|---|---|
| Le jeton est révoqué | `forge-atlassian variables list -e development` → « There are no variables in the development environment. » (la variable `PROBE_TOKEN` a été supprimée) |
| Le webtrigger est supprimé | `forge-atlassian webtrigger list` → « No webtrigger URLs created. » |
| L'URL ne répond plus | la requête sur l'URL de la sonde renvoie **HTTP 404** (`sonde-404.txt`) |

La sonde était *token-gatée* (variable Forge chiffrée) : sans `PROBE_TOKEN`, elle
refusait toute requête. Les deux premières vérifications suffisaient déjà à la
neutraliser ; la troisième montre qu'il n'en reste **plus de point d'entrée**.

## Pourquoi la sonde vivait sur sa propre branche

La sonde est un module `webtrigger`, et un webtrigger fait perdre l'éligibilité
*Runs on Atlassian*. Elle a donc vécu sur `dev/sonde-live`, **jamais mergée dans
`main`** : `main` ne contient ni `src/dev/` ni de module `webtrigger`. Après le
démontage, `main` redéployé a **retrouvé** le badge (voir
[déploiements](../deploiements/)).

## Ce que ça ne prouve pas

- La branche `dev/sonde-live` **n'existe qu'en local** : elle n'est pas sur
  `origin`. La commande `cmd=llm` qui a produit
  [la preuve du modèle hébergé](../llm-forge/) est donc **perdue** si le poste
  est réinstallé, alors que `docs/FIDELITY-LIVE-REPORT.md` renvoie à cette
  branche pour reproduire la mesure. C'est une incohérence à trancher.
- Les logs d'une sonde démontée ne sont plus accessibles par ce canal ; seuls
  les artefacts archivés dans ce paquet subsistent.
