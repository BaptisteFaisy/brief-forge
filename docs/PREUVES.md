# Preuves — convention du dépôt

> Une étape qui n'a pas de preuve n'est pas faite. Une preuve sans limite
> déclarée est une promesse, pas une mesure.

## La règle

Toute étape qui **change un comportement** — un correctif, un branchement, une
mesure — s'accompagne d'un artefact dans
`docs/evidence/<date>-<étape>/`, versionné dans le même dépôt.

Les preuves du 12 novembre 2026 sont dans
[`docs/evidence/2026-11-12/`](evidence/2026-11-12/) : c'est l'exemple de
référence.

## Ce qu'est un artefact

**La sortie brute d'une commande**, jamais une reformulation. Le fichier
commence par un en-tête de provenance :

```
# Provenance
- Date : 2026-11-12 16:40:54 CET
- Commande : `forge-atlassian environments list`
- Dépôt : brief-forge @ 2eb0ab5
```

Un artefact sans provenance n'est pas une preuve : c'est une capture d'écran.
Les codes couleur et les séquences de contrôle des CLI sont retirés — un
artefact lisible avant tout.

## Ce qu'est le README d'une étape

Trois sections obligatoires, dans cet ordre :

1. **Ce que ça prouve** — les faits, avec leurs chiffres.
2. **Comment reproduire** — les commandes exactes.
3. **Ce que ça ne prouve pas** — les limites, sans détour.

La troisième section est la plus importante : c'est elle qui distingue une
mesure d'une promesse. Elle a déjà empêché deux erreurs de raisonnement lors de
la session du 12 novembre (la condensation « fonctionnait » mais ne se
déclenchait pas ; le serveur MCP « répondait » mais aucun outil n'avait été
appelé).

## Ce qu'est le garde-fou

`test/preuves.test.ts`, joué par la CI, refuse :

- un artefact sans en-tête de provenance ;
- une étape sans README, ou dont le README ne dit pas ce qu'elle ne prouve pas ;
- une preuve contenant un motif de secret (`ghp_…`, `sk-…`, `AKIA…`, clé
  privée) ;
- une étape absente de l'index.

Un pack qui se périme en silence est un pack qui ne prouve plus rien.

## Capturer

```bash
bash scripts/capturer-preuves.sh
```

Le script réécrit les artefacts **rejouables** (déploiements, logs, MCP) et
archive ceux produits pendant la session quand ils sont encore sur le disque.
Il n'écrit aucun secret : les jetons viennent de l'environnement et ne sont
jamais imprimés. Une commande qui échoue n'interrompt pas la capture — l'échec
est écrit dans le fichier, pour qu'une preuve manquante soit **visible** plutôt
qu'absente.

## Ce qui ne va pas dans un artefact

- Un jeton, une clé, un mot de passe. Si une étape en a besoin, il vient de
  l'environnement (`PROBE_TOKEN`, `MCP_TOKEN`, `INFERHUB_API_KEY`) et n'est
  jamais écrit.
- Le contenu de tickets réels d'un client. Les artefacts de cette session
  portent les données **fabriquées** du site de démonstration ; PAY-6 y est
  exclu parce qu'il contient les pièges semés, dont un faux jeton.
- Une interprétation. Elle va dans le README de l'étape, à côté des chiffres.
