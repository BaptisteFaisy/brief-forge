# Les 10 items — où est la preuve de chacun

| # | Item | PR | Ce qui le prouve | Où |
|---|---|---|---|---|
| 01 | Condensation par modèle | #34 | 8 modèles exposés, `claude-haiku-4-5` choisi, 648 → 54 jetons en **861 ms** dans le runtime Forge | [`llm-forge/`](llm-forge/) · tests `test/llm/` |
| 02 | Brief dans la langue du ticket | #34 | ITO-1/ITO-2 (anglais) rendus en anglais, dates comprises ; PAY/MOBL (français) inchangés à l'octet | [`langue-brief/`](langue-brief/) · `test/brief/language.test.ts` |
| 03 | UI en UI Kit 2 (`@forge/react`) | #35 | rendu réel du point d'entrée sous React 18, composants partagés (`Screen`, `Notice`, `Strong`) | `test/ui/entrypoint.test.tsx`, `test/ui/screens.test.ts` |
| 04 | Scopes Teamwork Graph + PR refusées | #38 | 6 scopes déployés et consentis, warning `teamwork-graph-scopes` **disparu** de `forge lint` | [`deploiements/`](deploiements/) · `test/collect/teamworkGraphClient.test.ts` |
| 05 | Boucle leçons (revue → leçon → brief) | #43 | règle exacte de création d'une leçon et ses motifs de refus ; leçon ancienne marquée en FR **et** EN | `test/review/reviewService.test.ts`, `test/brief/sections.test.ts` |
| 06 | Test E2E avec un vrai client MCP | #42 | découverte OAuth **réelle** sur `mcp.atlassian.com`, 11 outils conformes au manifeste | [`mcp-e2e/`](mcp-e2e/) · `scripts/mcp-e2e.mjs` |
| 06 | …dont le chemin `asUser` (BC-09) | — | **bloqué par l'état du tenant** : app « Not sharing », aucun site proposé au consentement, `Accept` désactivé ; le contrôle « Enable tools » n'est pas rendu | [`mcp-asuser/`](mcp-asuser/) |
| 07 | Fidélité sur 31 tickets réels | #33 | 246/246 éléments sourcés et datés, **0** inventé, 93/93 budgets, 0 fuite | [`../live-fidelity-2026-11.json`](../live-fidelity-2026-11.json) · `docs/FIDELITY-LIVE-REPORT.md` |
| 08 | Trigger planifié + verrou d'idempotence | #38, **#41** | le bug GlobalStorage **et** sa correction dans le même fichier de logs : une exécution en erreur, puis quatre propres | [`trigger-planifie/`](trigger-planifie/) · `test/events/staleDrain.test.ts` |
| 09 | KPI réels (pas de mock) | #43 | 4 indicateurs sur les vraies tables, dénominateurs affichés, `null` (et non `0 %`) quand l'échantillon est insuffisant | `test/metrics/projectMetrics.test.ts`, `test/resolvers/entrypoint.test.ts` |
| 10 | Kit de démo rejouable | #42 | `--dry-run` joué (12, 16 et 5 requêtes produites), scores calculés par le vrai `computeReadiness` | `docs/DEMO-KIT.md` § 12 · `test/scripts/demoSeed.test.ts` |

## Ce que ces items n'ont pas de preuve live

Trois items sont prouvés **par tests seulement**, et il faut le dire :

- **03 (UI)** — les tests prouvent que l'arbre React se construit et que les
  données sont câblées, pas le rendu visuel dans un produit Atlassian. Cela
  demande un `forge deploy` et un œil humain.
- **04 (graphe)** — les scopes sont posés et validés par la lint, mais le
  chemin `asUser` n'a pas été exercé en direct : la sonde tourne en `asApp()`,
  or `requestTeamworkGraph` n'existe que dans `AsUserFetchMethods`. La
  validation reste à faire via un client MCP authentifié (item 06).
- **09 (KPI)** — les indicateurs sont calculés et testés, mais l'écran n'a pas
  été regardé en conditions réelles.

Et **10** : le kit de démo est outillé et rejouable, mais la **vidéo** n'est
pas dans le dépôt — `docs/VIDEO-SCRIPT.md` est le scénario, pas l'enregistrement.

## Règle pour la suite

Un item de plus n'est « fait » que si sa ligne ci-dessus a une preuve
**rejouable** : une commande, un test, ou un artefact versionné. Une ligne sans
preuve est une promesse.
