# Paquet de preuves — 13 novembre 2026

Ce que la session du 13 novembre 2026 a établi, étape par étape, avec la
sortie brute de chaque mesure.

| Étape | Ce qu'elle prouve | Artefacts |
|---|---|---|
| [Chemin `asUser`](mcp-asuser/) | Le chemin utilisateur **fonctionne** : OAuth réel, jeton utilisateur, `tools/call` sur le point d'entrée Atlassian en **production** — et le diagnostic du 12 novembre (« bloqué par l'état du tenant ») était **faux** | `e2e-run.txt`, `e2e-check-outils.txt`, `e2e-selftest.txt` |
| [Interface en conditions réelles](ui-live/) | Le panneau Jira et l'écran projet « Travail des agents » sont **rendus dans un vrai produit Atlassian**, avec des données réelles — la preuve live qui manquait aux items 03 et 09 | `panneau-jira-texte.txt`, `ecran-kpi-texte.txt` (+ captures dans `docs/captures/2026-11-13/`) |

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

Le paquet du 12 novembre conclut que le chemin `asUser` était « bloqué par
l'état du tenant » (app « Not sharing », `Accept` désactivé au consentement).
**Cette conclusion était fausse**, et elle a été vérifiée fausse : la cause
réelle était double, et les deux causes étaient dans le code.

Le détail est dans le README de l'étape [`mcp-asuser/`](mcp-asuser/) ; le
paquet du 12 a été corrigé en conséquence.
