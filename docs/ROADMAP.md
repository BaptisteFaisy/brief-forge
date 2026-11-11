# Feuille de route — brief-forge

> Document interne (français). Cible : **soumission Codegeist 2026 le
> 22 décembre 2026**. Aujourd'hui : **11 novembre 2026**. Neuf semaines, dont
> une semaine tampon.

## 1. Où on en est (11 novembre 2026)

### Fait

| Élément | État |
|---|---|
| `docs/CONTRACT.md` — signatures, arborescence, règles | écrit, fait foi |
| `src/types.ts` — types partagés | écrit |
| `src/config.ts` — budgets, poids, seuils, ordre des sections | écrit |
| `src/security.ts` — masquage de secrets, motifs d'injection, `sanitizeTicketContent` | écrit |
| `src/util/` — dates (`formatDateFr`, `isStaleDecision`), jetons (`estimateTokens`, `truncateToTokens`), markdown (`quoteBlock`, `truncationHint`, `BRIEF_DATA_DISCLAIMER`), erreurs typées | écrit |
| Documentation complète : README, ARCHITECTURE, SECURITY, JUDGE-INSTRUCTIONS, VIDEO-SCRIPT, ROADMAP, RECETTE | écrit (ce lot) |
| `package.json`, `tsconfig.json`, `jest.config.js` | écrit |

### Fait aussi (même journée, lots suivants)

Tous les modules métier sont **implémentés, testés et mergés** sur `main` :

- `src/collect/` — collecte Jira / Confluence / Teamwork Graph, avec replis
  (Confluence indisponible, graphe indisponible → information de développement
  Jira), commentaires à visibilité restreinte exclus du brief et du score,
  décisions lues dans Confluence **et** dans les commentaires marqués ;
- `src/brief/` — 10 sections dans l'ordre du § 7.1, budgets `s`/`m`/`l` tenus à
  ±10 %, troncature qui nomme l'outil de suite, source + date par élément ;
- `src/readiness/` — 7 critères, seuils 70/40, chaque point perdu expliqué ;
- `src/storage/` — DDL idempotent des 8 tables + dépôts (Forge SQL) ;
- `src/security/` — règles d'injection puis contrôle par modèle, citation des
  blocs tiers, garde d'accès au nom de l'utilisateur appelant, **21 motifs de
  secrets appliqués sur la lecture comme sur l'écriture** (BC-11) ;
- `src/actions/` — les 11 outils MCP (7 GET, 4 écritures bornées) ;
- `src/events/` — 4 triggers Jira + file + consumer des trois budgets ;
- `src/ui/` — 3 écrans Jira + aide à la connexion, bilingues FR/EN, et le point
  d'entrée UI Kit `src/ui/frontend.tsx` ;
- `manifest.yml` — passé au linter officiel `@forge/lint` : **0 erreur**,
  1 avertissement non bloquant (`teamwork-graph-scopes`) ;
- `skills/work-brief/` + `public-skill/SKILL.md` ;
- `docs/DEPLOY.md` + `scripts/deploy-check.sh` (9 contrôles hors ligne) ;
- `test/integration/` — faux Jira / Confluence / Teamwork Graph, **30 fixtures**
  (cas limites du § 17 et scénarios du § 19), 10 indicateurs de fidélité mesurés
  sur 90 briefs : `docs/FIDELITY-REPORT.md`.

Vérifications sur `main` : `tsc --noEmit` vert, **676 tests Jest verts**,
`npm run fidelity` vert, budget CI de 5 min respecté.

### Pas encore commencé (exige un compte et un site Atlassian)

- `forge register` / `deploy` / `install` sur un site réel — runbook écrit dans
  `docs/DEPLOY.md`, jamais exécuté faute d'identifiants ;
- les 5 validations réelles du § 15 (client MCP externe, identité en appel
  externe, état « refusée » d'une PR dans le graphe, durée d'un brief `l`,
  lecture Confluence depuis l'app Jira) — protocoles écrits, à jouer en direct ;
- vidéo de 5 minutes et captures d'écran (script minuté dans `docs/VIDEO-SCRIPT.md`) ;
- dépôt Devpost et listing Marketplace ;
- mesure de fidélité sur **30 tickets réels** (le jeu actuel est simulé :
  l'exigence « zéro décision inventée » du § 16 reste à confirmer sur données
  vivantes).

## 2. Jalons

| Jalon | Date | Critère de sortie |
|---|---|---|
| **J0 — Socle + docs** | 12 nov. | `tsc --noEmit` vert, docs relues, contrat figé |
| **J1 — Cœur métier** | 19 nov. | collecte + brief + readiness fonctionnels sur `PAY-123`, tests unitaires verts, budget `s` ≤ 1 100 jetons vérifié par test |
| **J2 — MCP debout** | 26 nov. | `manifest.yml` + 11 actions + `rovo:mcp` déployés sur site de démo ; les 11 outils répondent depuis Rovo Chat |
| **J3 — Boucle fermée** | 3 déc. | `post-work-report` → brief suivant ouvert par « Déjà tenté » ; triggers + consumer + invalidation < 2 min mesurée |
| **J4 — Sécurité + UI** | 10 déc. | les 8 scénarios de `RECETTE.md` passent ; 3 écrans Jira livrés ; `rovo:skill` + `rovo:agent` en place |
| **J5 — Client externe** | 12 déc. | [CC] et Cursor connectés en OAuth 2.1 sur le site de démo, `get-work-brief` appelé depuis l'extérieur |
| **J6 — Vidéo + captures** | 16 déc. | vidéo < 5 min montée selon `VIDEO-SCRIPT.md`, captures dans `docs/assets/` |
| **J7 — Soumission** | 19 déc. | dépôt public propre, README à jour, formulaire rempli |
| **Tampon** | 20–22 déc. | corrections, rien de nouveau |

## 3. Semaine par semaine

### Semaine du 11 nov. (W46) — figer le socle

- Relire `CONTRACT.md` à froid, corriger les ambiguïtés **avant** que les
  modules s'y engouffrent. Après J0, le contrat ne bouge plus sans raison
  majeure.
- Chaque module livre ses tests unitaires avec son code (pas de dette de test).
- Premier test de bout en bout : `buildBrief('PAY-123','s')` sur doublures,
  vérifier la présence des 10 sections dans l'ordre et la présence
  source+date sur chaque élément.
- Mettre en place le garde-fou de taille : un test qui échoue si un fichier de
  `src/` dépasse 500 lignes.

### Semaine du 18 nov. (W47) — cœur métier

- Collecte réelle sur le site de démo : `collectIssue`, `collectDecisions`
  (pages étiquetées `decision`), `collectNeighborChanges`, `collectProjectSettings`.
- Condensation LLM bornée ; mesure du coût par brief sur `PAY-123` aux trois
  budgets.
- Readiness : vérifier que chaque point perdu produit bien un `GapExplanation`
  non vide (test paramétré par critère).
- **Décision à prendre** : précalculer les trois budgets ou construire `l` à la
  demande (voir § 5).

### Semaine du 25 nov. (W48) — MCP debout

- `manifest.yml` complet : `rovo:mcp`, 11 `function`, `rovo:skill`,
  `rovo:agent`, 3 modules UI, 4 triggers, `consumer`, `sql`, `llm`.
- `src/index.ts` exporte tous les handlers référencés par le manifest.
- `forge deploy` + `forge install` sur le site de démo.
- Première démo interne : 11 outils appelés depuis Rovo Chat.
- Risque connu : la disponibilité de `rovo:mcp` dépend du tenant. Si le module
  n'est pas activable sur le site de démo, basculer la démo sur la skill Rovo et
  documenter l'écart (voir § 4).

### Semaine du 2 déc. (W49) — boucle fermée

- 4 triggers + consumer : file, idempotence, reprise après erreur.
- Invalidation : mesurer le délai modification → brief reconstruit. Objectif
  < 2 min ; mesurer aussi le pire cas (rafale de modifications).
- `record-failed-attempt` → le brief suivant **commence** « Déjà tenté » par
  cette tentative. C'est le test qui compte le plus pour les juges.
- `claim-work` : expiration 4 h, conflit renvoyé proprement.

### Semaine du 9 déc. (W50) — sécurité, UI, client externe

- Dérouler `RECETTE.md` intégralement, scénario par scénario, sur le site de
  démo. Tout écart est un bug, pas une note de bas de page.
- 3 écrans Jira : bandeau ticket, page projet, réglages projet.
- `rovo:skill` + `rovo:agent` : ordre d'appel vérifié sur trois tickets
  différents.
- Client externe : activation admin (**Apps → Sites → Connected apps**), OAuth
  2.1 depuis [CC] et Cursor, `get-work-brief` au budget `s` depuis l'extérieur.
- Revue de sécurité interne : relire `SECURITY.md` § 4 et vérifier que chaque
  limite assumée est bien une limite, pas un bug déguisé.

### Semaine du 16 déc. (W51) — vidéo et soumission

- Tournage selon `VIDEO-SCRIPT.md`, deux prises, montage à 4:50.
- Captures d'écran dans `docs/assets/` : score 45, brief budget `s`, commentaire
  piégé écarté, compte rendu signé, connexion client externe.
- Nettoyage du dépôt : pas de secret, pas de lien privé, `node_modules` ignoré,
  README à jour avec l'état réel.
- Soumission le 19, tampon les 3 jours restants.

## 4. Risques et parades

| Risque | Probabilité | Parade |
|---|---|---|
| `rovo:mcp` non activable sur le tenant de démo | moyenne | démo niveau 1 (Rovo Chat + skill) ; niveau 2 documenté comme « validé sur notre site » — c'est déjà ce que dit `JUDGE-INSTRUCTIONS.md` |
| Coût LLM de la condensation sur les trois budgets | moyenne | construire `l` à la demande ; mesurer avant J2 |
| Délai de reconstruction > 2 min en rafale | moyenne | file + reconstruction synchrone bornée ; afficher `stale: true` plutôt que bloquer |
| Permissions Forge SQL / schéma qui casse en migration | faible | DDL idempotent, pas de clé étrangère, pas d'`AUTO_INCREMENT` |
| Dérive du contrat en cours de route | moyenne | contrat figé à J0 ; tout changement passe par une revue explicite |
| Un module en retard bloque la démo | moyenne | ordre de la démo = ordre de valeur : readiness → brief → compte rendu. Ce qui est en retard sort de la vidéo, pas du produit |
| Vidéo > 5 min | élevée | minutage verrouillé dans `VIDEO-SCRIPT.md` ; on coupe dans le segment 4, jamais dans le 5 |

## 5. Décisions à prendre (pas encore tranchées)

1. **Trois budgets précalculés ou `l` à la demande ?** Précalculer coûte trois
   condensations par reconstruction ; construire à la demande coûte de la
   latence sur le chemin chaud. Recommandation actuelle : précalculer `s` et
   `m`, construire `l` à la demande.
2. **Détection d'instruction par modèle : sur tous les contenus tiers ou
   seulement sur ceux qui passent les règles ?** L'ordre « règles puis modèle »
   est retenu ; reste à mesurer le coût réel sur un projet bavard.
3. **`list-ready-work` : pagination avant ou après la soumission ?** Avant si
   un projet de démo dépasse 50 tickets ; sinon après.
4. **Leçons promues automatiquement ou seulement après `review` ?** Position
   actuelle : après `review` uniquement (anti-empoisonnement). À confirmer.

## 6. Après la soumission (hors périmètre, pour mémoire)

- Test d'intrusion externe, puis mise à jour de `SECURITY.md` § 4.
- Analyse d'entropie pour le masquage de secrets (au-delà des motifs).
- Analyse des pièces jointes (images, PDF).
- Authentification de l'agent au-delà du déclaratif dans `claim-work`.
- Pagination et index sur `list-ready-work` pour les gros projets.
