# Preuves — index

Les preuves du dépôt sont rangées en **paquets**, un par journée ou par thème.
Chaque paquet contient une étape par action, avec la sortie brute de la mesure.

| Paquet | Ce qu'il couvre | Index |
|---|---|---|
| [`2026-11-12`](2026-11-12/) | Session du 12 novembre 2026 : déploiements, trigger planifié, serveur MCP, modèle Forge, langue du brief, banc InferHub, démontage de la sonde | [README](2026-11-12/README.md) |

Artefacts antérieurs à la convention :

| Fichier | Ce que c'est |
|---|---|
| [`live-fidelity-2026-11.json`](live-fidelity-2026-11.json) | Mesure de fidélité sur 31 tickets réels (analyseur `scripts/live-fidelity.py`, rapport `docs/FIDELITY-LIVE-REPORT.md`) |

## Règle

Une étape qui n'a pas de preuve n'est pas faite ; une preuve sans limite
déclarée est une promesse. La convention complète — ce qu'est un artefact, ce
qu'est le README d'une étape, comment capturer — est dans
[`docs/PREUVES.md`](../PREUVES.md). Le garde-fou est `test/preuves.test.ts`.
