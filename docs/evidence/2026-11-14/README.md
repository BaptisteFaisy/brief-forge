# Paquet de preuves — 14 novembre 2026

Ce que la session du 14 novembre 2026 a établi, étape par étape, avec la
sortie brute de chaque mesure.

| Étape | Ce qu'elle prouve | Artefacts |
|---|---|---|
| [Jeton `asUser` renouvelable](refresh-jeton/) | La preuve `asUser` du 13/11 n'était **pas rejouable** (aucun `client_id` stocké, donc aucun `refresh_token` utilisable) et le README l'affirmait à tort ; le magasin de jetons persiste désormais le client, et un renouvellement ne demande plus de navigateur | `constat-jeton-13-11.txt`, `portes-entree.txt`, `tests-hors-ligne.txt` |

## Règles de ce paquet

1. **Chaque artefact est une sortie brute**, jamais une reformulation. Ce qui
   est interprété va dans le README de l'étape.
2. **Chaque artefact porte sa provenance** : date, commande, SHA du dépôt. Un
   artefact sans provenance n'est pas une preuve — c'est une capture d'écran.
3. **Chaque README dit ce que ça ne prouve pas.** Une preuve sans limite
   déclarée est une promesse, pas une mesure.
4. **Les étapes sont rejouables** quand la commande existe encore ; sinon
   l'artefact le dit.

## Ce que ce paquet corrige

Le paquet du 13 novembre ferme le diagnostic `asUser` — mais sa section
« Rejouer » promet un renouvellement par `refresh_token` qui n'était pas
possible : le `client_id` issu de l'enregistrement dynamique du client n'était
écrit nulle part. Cette étape-là est **consignée telle quelle** dans
[`2026-11-13/mcp-asuser/`](../2026-11-13/mcp-asuser/) avec son avertissement,
parce que c'est aussi une preuve : on peut mesurer une affirmation fausse, et
il faut le faire.

Le détail est dans le README de l'étape [`refresh-jeton/`](refresh-jeton/).
