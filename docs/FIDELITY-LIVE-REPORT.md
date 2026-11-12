# Fidélité mesurée sur tickets **réels** — 12 novembre 2026

> Complément vivant de [`FIDELITY-REPORT.md`](FIDELITY-REPORT.md) : celui-ci
> mesure le moteur sur 30 fixtures simulées, celui-là sur **31 tickets réels**
> d'un site Atlassian en ligne, avec l'app **déployée**.
>
> Exigence visée (§ 16 du cahier des charges) : *« Aucun élément sans source.
> Sur un jeu de 30 tickets d'essai, zéro décision ou critère inventé. »*

## Ce qui a été mesuré

| | |
|---|---|
| Site | `one-atlas-cndz.atlassian.net` (site de démo Atlassian) |
| App | `Brief de contexte`, `ari:cloud:ecosystem::app/08a89a5d-94d0-448f-8c1a-70f938b2c3a8`, environnement `development` |
| Tickets | **31 réels** : `PAY-1`…`PAY-20`, `PLAT-1`…`PLAT-6`, `MOBL-1`…`MOBL-3`, `ITO-1`, `ITO-2` (4 projets, types Task/Epic/Story/Incident/Service request, statuts To Do → Done) |
| Briefs | **93** (31 × budgets `s`, `m`, `l`) |
| Acteur | `asApp()` — un webtrigger n'a pas d'utilisateur appelant (voir *Limites*) |
| Capture | sonde `cmd=full` (branche `dev/sonde-live`, jamais mergée) : collecte brute + briefs + score |
| Mesure | `scripts/live-fidelity.py` sur les captures, hors ligne |
| Preuve | [`evidence/live-fidelity-2026-11.json`](evidence/live-fidelity-2026-11.json) (indicateurs par ticket, aucun texte de ticket) |

## Résultats

| Indicateur | Cible | Résultat |
|---|---|---|
| Éléments portant **source et date** (BC-02) | 100 % | **246 / 246** |
| Éléments **inventés** (non rattachables à la collecte) | **0** | **0** |
| Budget respecté (±10 %) | 100 % | **93 / 93** |
| Troncature nommant l'outil de suite | 100 % | 93 / 93 (aucune troncature sur ce jeu : tickets courts) |
| Fuite d'une instruction adressée à un agent (BC-10) | **0** | **0** |
| Fuite d'un secret (BC-11) | **0** | **0** |
| Contenu écarté **signalé** (§ 13) | toujours | 3 briefs (les pièges semés sur `PAY-6`) |
| Score de préparation cohérent (BC-04) | 100 % | **31 / 31** |
| Trous signalés (BC-03) | — | 642 au total, soit 6,9 par brief |

### Durées réelles (construction à la volée, aucune en cache)

| Budget | min | médiane | p95 | max | Cible |
|---|---|---|---|---|---|
| `s` | 944 ms | 1 055 ms | 2 969 ms | 3 366 ms | < 40 s |
| `m` | 942 ms | 1 028 ms | 2 934 ms | 3 177 ms | < 40 s |
| `l` | 944 ms | 1 056 ms | 2 973 ms | 4 511 ms | < 40 s |

Validation § 15(d) : un brief `l` construit à la volée tient largement dans la
limite d'une action (55 s) et dans la cible « à la volée < 40 s ». Le pic à
4,5 s correspond au premier appel d'un ticket (Jira + Confluence + réglages à
froid) ; la médiane est à ~1 s.

## Comment lire « zéro élément inventé »

La mesure ne se contente pas de comparer des textes : chaque élément des sept
sections sourcées (critères, décisions, tentatives, voisins, contraintes,
leçons, contacts) doit être **rattachable à la collecte** — soit cité (le texte
normalisé se retrouve dans le ticket, ses commentaires, ses décisions, ses
voisins ou ses champs), soit **composé** par le moteur à partir de valeurs
réellement collectées (« Type de ticket : Epic — statut To Do », « untel
(assigné) », « Zone technique : commandes »). Un élément qui ne rentre dans
aucune des deux catégories est compté comme inventé. Résultat sur 246 éléments
réels : **aucun**.

## Ce que le réel a montré que les fixtures ne montraient pas

1. **Les sources en panne sont signalées, jamais comblées.** Sur les 31 tickets,
   la collecte des *changements voisins* a échoué (`asApp()` n'a pas accès à
   l'information de développement : 403). Le brief ne l'a pas masqué : il porte
   « Collecte incomplète — Changements voisins indisponible » dans la section
   « Trous », et la section 5 reste vide au lieu d'être inventée. C'est
   exactement le comportement exigé par BC-03, observé pour de vrai.
2. **Les vrais tickets sont pauvres.** Sur 31 tickets d'un site de démo :
   0 critère d'acceptation détecté dans 29 cas, très peu de commentaires, aucun
   composant. Les scores tombent à 30-60 et la section « Trous » fait le travail
   : le produit dit « ce ticket n'est pas prêt pour un agent », ce qui est la
   promesse (§ 6.2).
3. **Les types de ticket exotiques passent** (« [System] Service request »,
   « Incident ») sans casser la collecte ni le rendu.
4. **Les pièges semés sont neutralisés et dits.** Sur `PAY-6`, trois
   commentaires piégés (instruction adressée à un agent, faux jeton GitHub,
   `password=…`) : le jeton ressort masqué en `[SECRET:GH_PAT]` dans la décision
   citée, l'instruction ne réapparaît nulle part, et la section « Trous » annonce
   « 3 passage(s) écarté(s) du brief : instruction suspecte adressée à un agent
   (auteur, date) ». Recette § 19 n° 3 validée sur données réelles.

## Limites honnêtes de cette mesure

- **Acteur `asApp()`, pas `asUser()`.** Un webtrigger n'a pas d'utilisateur
  appelant, et Forge **refuse l'usurpation** (`401 NO_IMPERSONATION_SCOPES_DEFINED`
  si l'on passe un `accountId`). Le chemin BC-09 (« ne jamais dépasser les droits
  de l'utilisateur appelant ») n'est donc **pas** exercé ici : il est couvert par
  les tests unitaires et reste à confirmer avec un vrai client MCP authentifié
  (voir [`MCP-E2E.md`](MCP-E2E.md)).
- **Voisins et graphe absents** de ces 31 mesures (cause ci-dessus) : la section 5
  et le Teamwork Graph restent à valider avec un appel utilisateur réel.
- **Confluence** : la recherche de pages étiquetées `decision`/`adr` renvoie 403
  en `asApp()` depuis une installation Jira ; les décisions en commentaire, elles,
  remontent bien (§ 7.1 rang 3). La lecture Confluence reste à valider en
  `asUser()` — c'est l'objet de la validation § 15(e).
- **Pas de condensation par modèle** dans ces 93 mesures : le condenseur rendait
  le texte d'origine, aucun modèle n'étant branché. Depuis, le modèle est branché
  et **prouvé en runtime**, mais il reste inerte sur ce jeu — aucun élément
  n'atteint le plafond qui déclenche l'appel. Voir « Complément du 12 novembre »
  ci-dessous : la mesure des 93 briefs reste valable telle quelle.

## Complément du 12 novembre — app v5.1.0 (modèle branché, langue, scopes)

Les trois lots fusionnés après la mesure ci-dessus (`#34` condensation + langue
du ticket, `#35` UI Kit 2, `#38` scopes Teamwork Graph + trigger planifié +
verrou) ont été redéployés sur `development` avec la sonde, puis re-mesurés.

### Le modèle hébergé répond en runtime

Le chemin `@forge/llm` est prouvé **dans le runtime réel**, pas seulement sur
doublure. La sonde expose `cmd=llm`, qui isole les quatre étapes dans l'ordre où
le moteur les emprunte :

| Étape | Résultat |
|---|---|
| Modèles exposés par le runtime | **8**, tous `active` |
| Modèle choisi par le moteur | `claude-haiku-4-5-20251001` — le plus économique des `active`, comme le veut la règle de choix |
| Repli déclaré | `claude-haiku-4-5` |
| Complétion directe (hors moteur) | **845 ms** |
| Condensation : 648 jetons, budget 60 | **54 jetons rendus en 861 ms**, `condensed: true` |

### La condensation ne se déclenche pas sur ce jeu — mesuré, pas supposé

Le moteur ne consulte le modèle que lorsqu'un élément dépasse le plafond par
budget (`ITEM_CAP_TOKENS` dans `src/brief/builder.ts` : **80 / 160 / 320**
jetons). Aucun élément des tickets de ce site ne l'atteint. Cinq tickets
re-capturés × 3 budgets, comparés aux captures d'origine :

| Tickets | Markdown avant → après |
|---|---|
| PAY-6, PAY-17, MOBL-2 | **identique** (2612 / 2172 / 2022 caractères) |
| ITO-1, ITO-2 | différent — la **langue**, pas la condensation (ci-dessous) |

Le delta des deux tickets ITO est **identique sur les trois budgets**, ce qui
exclut la condensation (elle dépend du plafond, donc du budget) et signe un
changement déterministe de libellés.

Conséquence honnête : la mesure des 93 briefs reste valable telle quelle. Pour
exercer la condensation sur le réel, il faudrait un ticket dont un élément
dépasse 320 jetons.

### Le brief suit la langue du ticket (prouvé sur données réelles)

ITO-1 et ITO-2 sont des tickets **anglais** : leur brief est désormais rendu en
anglais de bout en bout, dates comprises —

```diff
- # Brief de travail — ITO-1 (budget l, cible ≈ 8000 jetons)
+ # Work brief — ITO-1 (budget l, target ≈ 8000 tokens)
- _Construit le 12 novembre 2026 · [System] Service request · statut Resolved · projet ITO_
+ _Built on 12 November 2026 · [System] Service request · status Resolved · project ITO_
- _Aucun critère d'acceptation dans le ticket : à obtenir avant de coder._
+ _No acceptance criteria in the issue: get them before coding._
- _Jira ITO-1 — 11 août 2021_
+ _Jira ITO-1 — 11 August 2021_
```

Les tickets français (PAY, MOBL) sont **inchangés**, et dans les deux langues le
contenu tiers cité — résumé, description, commentaires — n'est pas traduit :
seuls les libellés produits par le moteur changent.

### Re-mesure de fidélité sur ces 5 tickets (15 briefs)

| Indicateur | Cible | Résultat |
|---|---|---|
| Éléments analysés | — | 54 |
| Éléments sans source ni date | 0 | **0** |
| Éléments introuvables (inventés) | **0** | **0** |
| Budgets tenus à ±10 % | 100 % | **15 / 15** |
| Troncatures non nommées | 0 | **0** |
| Fuite d'instruction | 0 | **0** |
| Fuite de secret | 0 | **0** |
| Contenu écarté signalé | toujours | 3 briefs (PAY-6, pièges semés) |
| Score de préparation cohérent | 100 % | **5 / 5** |
| Durée d'un brief | < 40 s | médiane **1,15 s**, max 1,47 s |

Les 5 tickets gardent leur erreur de collecte « voisins : Accès refusé »,
signalée comme trou plutôt que comblée — la dégradation honnête tient toujours
après les trois lots.

### Scopes Teamwork Graph déployés, chemin utilisateur toujours non exercé

Les 6 scopes `read:graph:*` sont déployés et consentis (`forge install
--upgrade`), et `forge lint` ne signale plus le warning `teamwork-graph-scopes`.
**Mais** la sonde tourne en `asApp()` et `requestTeamworkGraph` n'existe que dans
`AsUserFetchMethods` : le chemin graphe reste donc non exercé ici, et les 5
re-captures renvoient toujours `voisins : Accès refusé`. La limite « acteur
`asApp` » décrite plus haut est **inchangée** — l'ajout des scopes est une
condition nécessaire, pas une validation.

### Reproduire ce complément

```bash
# Preuve du chemin modèle (aucune écriture, aucun ticket touché)
curl -s "$URL?token=$PROBE_TOKEN&cmd=llm&repeats=12&budget=60"

# Re-capture et comparaison
curl -s "$URL?token=$PROBE_TOKEN&cmd=full&issue=ITO-1&budgets=s,m,l" > captures-2/ITO-1.json
python3 scripts/live-fidelity.py captures-2/ > resultat-2.json
```

## Reproduire

```bash
# 1. Déployer la sonde (branche dev/sonde-live, jamais mergée dans main)
git switch dev/sonde-live
forge-atlassian variables set PROBE_TOKEN "<jeton aléatoire>" --encrypt -e development
forge-atlassian deploy -e development --non-interactive --approve MAJOR_VERSION_RULE
forge-atlassian install --upgrade -e development -p jira -s <site>.atlassian.net --non-interactive --confirm-scopes
forge-atlassian webtrigger create --functionKey dev-probe -s <site>.atlassian.net -p jira -e development

# 2. Énumérer les tickets réels, puis capturer
curl -s "$URL?token=$PROBE_TOKEN&cmd=scan&prefix=PAY&from=1&to=40"
curl -s "$URL?token=$PROBE_TOKEN&cmd=full&issue=PAY-6&budgets=s,m,l" > captures/PAY-6.json

# 3. Mesurer hors ligne
python3 scripts/live-fidelity.py captures/ > resultat.json

# 4. Retirer la sonde (l'app retrouve son éligibilité Runs on Atlassian)
git switch main
forge-atlassian deploy -e development --non-interactive
forge-atlassian webtrigger delete --url "$URL" -e development
```

La sonde est **token-gatée** (variable Forge chiffrée), ne fait aucune écriture
sauf les commentaires de recette explicitement demandés, et vit sur sa propre
branche : `main` ne contient aucun webtrigger et reste éligible
*Runs on Atlassian*.
