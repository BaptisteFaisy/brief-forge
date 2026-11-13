# Les 10 items — où est la preuve de chacun

| # | Item | PR | Ce qui le prouve | Où |
|---|---|---|---|---|
| 01 | Condensation par modèle | #34 | 8 modèles exposés, `claude-haiku-4-5` choisi, 648 → 54 jetons en **861 ms** dans le runtime Forge | [`llm-forge/`](llm-forge/) · tests `test/llm/` |
| 02 | Brief dans la langue du ticket | #34 | ITO-1/ITO-2 (anglais) rendus en anglais, dates comprises ; PAY/MOBL (français) inchangés à l'octet | [`langue-brief/`](langue-brief/) · `test/brief/language.test.ts` |
| 03 | UI en UI Kit 2 (`@forge/react`) | #35, **#53** | **rendu réel dans Jira** (installation production) : panneau « Brief d'agent », score 39/100, conseil et 4 manques chiffrés ; captures dans `docs/captures/2026-11-13/` | [`../2026-11-13/ui-live/`](../2026-11-13/ui-live/) · `test/ui/entrypoint.test.tsx` |
| 04 | Scopes Teamwork Graph + PR refusées | #38 | 6 scopes déployés et consentis, warning `teamwork-graph-scopes` **disparu** de `forge lint` | [`deploiements/`](deploiements/) · `test/collect/teamworkGraphClient.test.ts` |
| 05 | Boucle leçons (revue → leçon → brief) | #43 | règle exacte de création d'une leçon et ses motifs de refus ; leçon ancienne marquée en FR **et** EN | `test/review/reviewService.test.ts`, `test/brief/sections.test.ts` |
| 06 | Test E2E avec un vrai client MCP | #42 | découverte OAuth **réelle** sur `mcp.atlassian.com`, 11 outils conformes au manifeste | [`mcp-e2e/`](mcp-e2e/) · `scripts/mcp-e2e.mjs` |
| 06 | …dont le chemin `asUser` (BC-09) | #52 | **ouvert et prouvé en production** : OAuth réel, jeton utilisateur, `tools/call` sur PAY-220 (score 39/100, brief sourcé et daté) ; l'identité porte bien celle de l'appelant (`/myself` = accountId du contexte) | [`../2026-11-13/mcp-asuser/`](../2026-11-13/mcp-asuser/) |
| 07 | Fidélité sur 31 tickets réels | #33 | 246/246 éléments sourcés et datés, **0** inventé, 93/93 budgets, 0 fuite | [`../live-fidelity-2026-11.json`](../live-fidelity-2026-11.json) · `docs/FIDELITY-LIVE-REPORT.md` |
| 08 | Trigger planifié + verrou d'idempotence | #38, **#41** | le bug GlobalStorage **et** sa correction dans le même fichier de logs : une exécution en erreur, puis quatre propres | [`trigger-planifie/`](trigger-planifie/) · `test/events/staleDrain.test.ts` |
| 09 | KPI réels (pas de mock) | #43, **#53** | **écran projet vu dans Jira** : 3 indicateurs (dont « données insuffisantes » quand l'échantillon est trop petit), manques les plus fréquents, tickets prêts / en cours / rendus avec leur agent | [`../2026-11-13/ui-live/`](../2026-11-13/ui-live/) · `test/metrics/projectMetrics.test.ts` |
| 10 | Kit de démo rejouable | #42 | `--dry-run` joué (12, 16 et 5 requêtes produites), scores calculés par le vrai `computeReadiness` | `docs/DEMO-KIT.md` § 12 · `test/scripts/demoSeed.test.ts` |

## Ce que ces items n'ont pas de preuve live

Trois items sont prouvés **par tests seulement**, et il faut le dire :

- ~~**03 (UI)**~~ — **résolu le 13/11** : l'interface est rendue dans un
  vrai Jira, sur le site de démo, avec des données réelles
  ([`2026-11-13/ui-live/`](../2026-11-13/ui-live/)). Ce qui n'est pas fait :
  un audit d'accessibilité, et le rendu en français (la capture est en `EN`).
- **04 (graphe)** — les scopes sont posés et validés par la lint. Le chemin
  `asUser` **est** désormais exercé en direct (item 06 : jeton utilisateur,
  `tools/call` réel), et `get-neighbor-changes` répond — mais sur PAY-220,
  ticket sans PR liée, il renvoie `changes: []`. La lecture du graphe par un
  client authentifié **n'est donc pas prouvée** : il faudrait un ticket avec
  des PR liées.
- ~~**09 (KPI)**~~ — **résolu le 13/11** : l'écran « Travail des agents » a
  été regardé dans Jira, sur le site de démo
  ([`2026-11-13/ui-live/`](../2026-11-13/ui-live/)). Ce qui n'est pas fait :
  un recalcul indépendant des chiffres affichés — la formule reste prouvée par
  les tests, pas par l'écran.

Et **10** : le kit de démo est outillé et rejouable, mais la **vidéo** n'est
pas dans le dépôt — `docs/VIDEO-SCRIPT.md` est le scénario, pas l'enregistrement.

## Règle pour la suite

Un item de plus n'est « fait » que si sa ligne ci-dessus a une preuve
**rejouable** : une commande, un test, ou un artefact versionné. Une ligne sans
preuve est une promesse.
