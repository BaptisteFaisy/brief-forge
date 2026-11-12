# Paquet de preuves — 12 novembre 2026

Ce que la session du 12 novembre 2026 a établi, **étape par étape**, avec la
sortie brute de chaque mesure. Rien ici n'est un résumé de mémoire : chaque
fichier est la trace d'une commande réellement exécutée.

| Étape | Ce qu'elle prouve | Artefacts |
|---|---|---|
| [Déploiements](deploiements/) | `main` est déployé sur `development` (v5.5.0), éligible *Runs on Atlassian* ; la condensation LLM est allumée **sur `development` seulement** | `environnements.txt`, `eligibilite.txt`, `porte-llm.txt` |
| [Trigger planifié](trigger-planifie/) | Le bug d'authentification GlobalStorage **et** sa correction, dans le même fichier : une exécution en erreur puis quatre propres | `logs-drain.txt` |
| [Serveur MCP](mcp-e2e/) | Le serveur MCP répond sur le vrai point d'entrée Atlassian ; les 11 outils sont conformes au manifeste | `decouverte-mcp.txt`, `selftest-outils.txt` |
| [Modèle hébergé Forge](llm-forge/) | `@forge/llm` répond **dans le runtime Forge** : 8 modèles, `claude-haiku-4-5` choisi, 648 → 54 jetons en 861 ms | `probe-llm.json` |
| [Langue du brief](langue-brief/) | Le brief suit la langue du ticket, et la fidélité tient toujours (0 inventé, 15/15 budgets) | `diff-ito.txt`, `fidelite-recapture.json` |
| [Banc InferHub](banc-inferhub/) | Le même pipeline de condensation marche avec un fournisseur tiers, ~100× moins cher — mais trop lent pour la production | `sortie-banc.txt` |
| [Démontage de la sonde](nettoyage-sonde/) | La sonde est hors service : jeton révoqué, webtrigger supprimé, URL en `404` | `sonde-404.txt`, `webtrigger-list.txt` |

La mesure de fidélité sur 31 tickets réels (étape antérieure) reste dans
[`live-fidelity-2026-11.json`](live-fidelity-2026-11.json) ; son analyse et ses
limites sont dans [`FIDELITY-LIVE-REPORT.md`](../FIDELITY-LIVE-REPORT.md).

Le point d'entrée du paquet est la table des dix items :
[`items-01-10.md`](items-01-10.md) — pour chacun, la PR, ce qui le prouve, où
le lire, et **ce qui n'a pas de preuve live**.

## Règles de ce paquet

1. **Chaque artefact est une sortie brute**, jamais une reformulation. Ce qui
   est interprété va dans le README de l'étape.
2. **Chaque artefact porte sa provenance** : date, commande, SHA du dépôt. Un
   artefact sans provenance n'est pas une preuve — c'est une capture d'écran.
3. **Chaque README dit ce que ça ne prouve pas.** Une preuve sans limite
   déclarée est une promesse, pas une mesure.
4. **Les steps sont rejouables** quand la commande existe encore ; sinon
   l'artefact le dit (`NON DISPONIBLE`).

## Rejouer la capture

```bash
bash scripts/capturer-preuves.sh
```

Le script réécrit les artefacts **rejouables** (déploiements, logs, MCP) et
archive ceux produits pendant la session quand ils sont encore sur le disque.
Il n'écrit aucun secret : les jetons viennent de l'environnement et ne sont
jamais imprimés.

Le garde-fou est `test/preuves.test.ts` : il refuse en CI un artefact sans
provenance, une étape sans README, ou une preuve qui contiendrait un motif de
secret.
