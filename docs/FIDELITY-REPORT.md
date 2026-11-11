# Rapport de fidélité — brief-forge

> Généré le 2026-11-11 par `npm run fidelity` (jest :
> `test/integration/fidelity.test.ts`). Reproductible : mêmes fixtures → même
> rapport (lignes triées par fixture puis budget) ; seule la date de génération
> varie. Les compteurs de jetons incluent l’en-tête « Construit le … » du brief,
> ils sont donc stables à jour de génération donné.

## Méthode

- 30 fixtures du lot C1 (`test/integration/fixtures/`) × budgets `s`, `m`, `l`.
- Monde simulé `buildWorld(fixture)` : faux Jira / Confluence / Teamwork Graph,
  aucun appel réseau ; brief construit par `buildBrief(key, budget, world.briefDeps)`,
  préparation par `computeReadiness(issue, settings, { decisions, comments, attempts })`.
- Indicateurs : fonctions pures de `test/integration/metrics.ts` (cibles du contrat § 4).

## Interprétations retenues

- `budgetCompliance` : le socle garantit la **borne haute** (`estimateTokens(markdown)`
  ≤ cible × 1,10 — `BUDGET_TOLERANCE`) ; un brief plus court que la cible est conforme
  (exigence de sobriété). La colonne affiche les jetons mesurés.
- `gapRecall` : rappel des `gapsExpected` dans `ReadinessScore.gaps` ; `holesRecall`
  (complément) : rappel des `holesExpected` dans la section 9 « Trous » du brief.
- `secretLeak` : secrets **et** contenus confidentiels interdits (visibilité restreinte,
  page d’une source en panne) ; `injectionLeak` : instructions adressées à un agent.
- `inventedItems` : traçabilité par comparaison normalisée (casse, accents, apostrophes,
  espaces, ponctuation) des éléments des 7 sections sourcées contre les graines de la
  fixture (résumé, description, critères, champs personnalisés, décisions, tentatives,
  voisins, commentaires, liens, leçons, contraintes, personnes). Sections « Trous » et
  « Sources » (produites par le moteur) et champ `objective` hors périmètre du comptage.
- Citations attendues (`decisionsCited`, `criteriaCited`, `neighborsCited`,
  `attemptsFirst`, `mustAppear`) : assertées par budget ; une coupe budgétaire annoncée
  (troncature nommée) tolère un compte inférieur, jamais un compte supérieur.

## Agrégat global

| Indicateur | Cible | Conformité |
|---|---|---|
| `sourcesCoverage` | 100 % | 90/90 ✓ |
| `inventedItems` | 0 | 90/90 ✓ |
| `budgetCompliance` | cible +10 % max | 90/90 ✓ |
| `truncationNamed` | 100 % | 90/90 ✓ |
| `injectionLeak` | 0 | 90/90 ✓ |
| `secretLeak` | 0 | 90/90 ✓ |
| `gapRecall` | ≥ 90 % | 90/90 ✓ |
| `readinessAccuracy` | 100 % | 90/90 ✓ |
| `staleFlagged` | 100 % | 90/90 ✓ |
| `holesRecall` | ≥ 90 % | 90/90 ✓ |

## Détail par fixture

| Ticket | Scénario | Budget | Jetons | Sources | Inventés | Budget | Tronc. |
| Injection | Secret | Gaps | Trous | Préparation | Anciennes | Citations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CMD-1 | 01 — Ticket nominal complet | s | 745 | 100 % | 0 | 745 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-1 | 01 — Ticket nominal complet | m | 756 | 100 % | 0 | 756 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-1 | 01 — Ticket nominal complet | l | 756 | 100 % | 0 | 756 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-2 | 02 — Ticket sans description | s | 482 | 100 % | 0 | 482 | 100 % | 0 | 0 | 100 % | 100 % | non prêt (39) | 100 % | ✓ |
| CMD-2 | 02 — Ticket sans description | m | 482 | 100 % | 0 | 482 | 100 % | 0 | 0 | 100 % | 100 % | non prêt (39) | 100 % | ✓ |
| CMD-2 | 02 — Ticket sans description | l | 482 | 100 % | 0 | 482 | 100 % | 0 | 0 | 100 % | 100 % | non prêt (39) | 100 % | ✓ |
| CMD-3 | 03 — Ticket à 300 commentaires | s | 693 | 100 % | 0 | 693 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-3 | 03 — Ticket à 300 commentaires | m | 704 | 100 % | 0 | 704 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-3 | 03 — Ticket à 300 commentaires | l | 704 | 100 % | 0 | 704 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-4 | 04 — Décisions contradictoires | s | 677 | 100 % | 0 | 677 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| CMD-4 | 04 — Décisions contradictoires | m | 688 | 100 % | 0 | 688 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| CMD-4 | 04 — Décisions contradictoires | l | 688 | 100 % | 0 | 688 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| CMD-5 | 05 — Décision de plus de 18 mois | s | 577 | 100 % | 0 | 577 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-5 | 05 — Décision de plus de 18 mois | m | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| CMD-5 | 05 — Décision de plus de 18 mois | l | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-6 | 06 — Commentaire avec instruction adressée à un agent | s | 637 | 100 % | 0 | 637 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-6 | 06 — Commentaire avec instruction adressée à un agent | m | 648 | 100 % | 0 | 648 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-6 | 06 — Commentaire avec instruction adressée à un agent | l | 648 | 100 % | 0 | 648 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-7 | 07 — Commentaire et description contenant des secrets | s | 538 | 100 % | 0 | 538 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-7 | 07 — Commentaire et description contenant des secrets | m | 538 | 100 % | 0 | 538 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-7 | 07 — Commentaire et description contenant des secrets | l | 538 | 100 % | 0 | 538 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-8 | 08 — Commentaires à visibilité restreinte | s | 538 | 100 % | 0 | 538 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-8 | 08 — Commentaires à visibilité restreinte | m | 549 | 100 % | 0 | 549 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-8 | 08 — Commentaires à visibilité restreinte | l | 549 | 100 % | 0 | 549 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-9 | 09 — Lien bloquant ouvert et utilisateur sans droit de commenter | s | 538 | 100 % | 0 | 538 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-9 | 09 — Lien bloquant ouvert et utilisateur sans droit de commenter | m | 549 | 100 % | 0 | 549 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-9 | 09 — Lien bloquant ouvert et utilisateur sans droit de commenter | l | 549 | 100 % | 0 | 549 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-10 | 10 — Pull request refusée il y a trois mois | s | 555 | 100 % | 0 | 555 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-10 | 10 — Pull request refusée il y a trois mois | m | 566 | 100 % | 0 | 566 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-10 | 10 — Pull request refusée il y a trois mois | l | 566 | 100 % | 0 | 566 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-11 | 11 — Tentative abandonnée enregistrée en tête de Déjà tenté | s | 611 | 100 % | 0 | 611 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-11 | 11 — Tentative abandonnée enregistrée en tête de Déjà tenté | m | 622 | 100 % | 0 | 622 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-11 | 11 — Tentative abandonnée enregistrée en tête de Déjà tenté | l | 622 | 100 % | 0 | 622 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-12 | 12 — Réouvertures multiples du ticket | s | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-12 | 12 — Réouvertures multiples du ticket | m | 569 | 100 % | 0 | 569 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-12 | 12 — Réouvertures multiples du ticket | l | 569 | 100 % | 0 | 569 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-13 | 13 — Compte rendu sans tests | s | 547 | 100 % | 0 | 547 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-13 | 13 — Compte rendu sans tests | m | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-13 | 13 — Compte rendu sans tests | l | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-14 | 14 — Ticket sans composant ni zone | s | 547 | 100 % | 0 | 547 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-14 | 14 — Ticket sans composant ni zone | m | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-14 | 14 — Ticket sans composant ni zone | l | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-15 | 15 — Auteur au compte inactif et sans assigné | s | 560 | 100 % | 0 | 560 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-15 | 15 — Auteur au compte inactif et sans assigné | m | 571 | 100 % | 0 | 571 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-15 | 15 — Auteur au compte inactif et sans assigné | l | 571 | 100 % | 0 | 571 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-16 | 16 — Question sans réponse dans les commentaires | s | 540 | 100 % | 0 | 540 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-16 | 16 — Question sans réponse dans les commentaires | m | 551 | 100 % | 0 | 551 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-16 | 16 — Question sans réponse dans les commentaires | l | 551 | 100 % | 0 | 551 | 100 % | 0 | 0 | 100 % | 100 % | prêt (90) | 100 % | ✓ |
| PAY-17 | 17 — Périmètre non borné (deux objectifs, description fleuve) | s | 539 | 100 % | 0 | 539 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-17 | 17 — Périmètre non borné (deux objectifs, description fleuve) | m | 618 | 100 % | 0 | 618 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-17 | 17 — Périmètre non borné (deux objectifs, description fleuve) | l | 780 | 100 % | 0 | 780 | 100 % | 0 | 0 | 100 % | 100 % | prêt (85) | 100 % | ✓ |
| PAY-18 | 18 — Critères d’acceptation dans un champ personnalisé | s | 533 | 100 % | 0 | 533 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-18 | 18 — Critères d’acceptation dans un champ personnalisé | m | 544 | 100 % | 0 | 544 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-18 | 18 — Critères d’acceptation dans un champ personnalisé | l | 544 | 100 % | 0 | 544 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-19 | 19 — Critères d’acceptation non vérifiables | s | 547 | 100 % | 0 | 547 | 100 % | 0 | 0 | 100 % | 100 % | prêt (70) | 100 % | ✓ |
| PAY-19 | 19 — Critères d’acceptation non vérifiables | m | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (70) | 100 % | ✓ |
| PAY-19 | 19 — Critères d’acceptation non vérifiables | l | 558 | 100 % | 0 | 558 | 100 % | 0 | 0 | 100 % | 100 % | prêt (70) | 100 % | ✓ |
| PAY-20 | 20 — Épopée parente avec décisions héritées | s | 582 | 100 % | 0 | 582 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-20 | 20 — Épopée parente avec décisions héritées | m | 593 | 100 % | 0 | 593 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-20 | 20 — Épopée parente avec décisions héritées | l | 593 | 100 % | 0 | 593 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-21 | 21 — Page Confluence étiquetée decision liée au ticket | s | 580 | 100 % | 0 | 580 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-21 | 21 — Page Confluence étiquetée decision liée au ticket | m | 591 | 100 % | 0 | 591 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-21 | 21 — Page Confluence étiquetée decision liée au ticket | l | 591 | 100 % | 0 | 591 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-22 | 22 — Page Confluence étiquetée adr liée à l’épopée | s | 580 | 100 % | 0 | 580 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-22 | 22 — Page Confluence étiquetée adr liée à l’épopée | m | 591 | 100 % | 0 | 591 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-22 | 22 — Page Confluence étiquetée adr liée à l’épopée | l | 591 | 100 % | 0 | 591 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-23 | 23 — Confluence indisponible, repli sur commentaires | s | 554 | 100 % | 0 | 554 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-23 | 23 — Confluence indisponible, repli sur commentaires | m | 565 | 100 % | 0 | 565 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-23 | 23 — Confluence indisponible, repli sur commentaires | l | 565 | 100 % | 0 | 565 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-24 | 24 — Teamwork Graph indisponible, repli dev-status Jira | s | 650 | 100 % | 0 | 650 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-24 | 24 — Teamwork Graph indisponible, repli dev-status Jira | m | 661 | 100 % | 0 | 661 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-24 | 24 — Teamwork Graph indisponible, repli dev-status Jira | l | 661 | 100 % | 0 | 661 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-25 | 25 — Voisins nombreux (troncature sous budget s) | s | 1099 | 100 % | 0 | 1099 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-25 | 25 — Voisins nombreux (troncature sous budget s) | m | 1723 | 100 % | 0 | 1723 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-25 | 25 — Voisins nombreux (troncature sous budget s) | l | 1723 | 100 % | 0 | 1723 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-26 | 26 — Décisions nombreuses (troncature get-related-decisions) | s | 1042 | 100 % | 0 | 1042 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-26 | 26 — Décisions nombreuses (troncature get-related-decisions) | m | 2740 | 100 % | 0 | 2740 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-26 | 26 — Décisions nombreuses (troncature get-related-decisions) | l | 2740 | 100 % | 0 | 2740 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-27 | 27 — Leçons issues de comptes rendus corrigés sur le composant | s | 608 | 100 % | 0 | 608 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-27 | 27 — Leçons issues de comptes rendus corrigés sur le composant | m | 619 | 100 % | 0 | 619 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-27 | 27 — Leçons issues de comptes rendus corrigés sur le composant | l | 619 | 100 % | 0 | 619 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-28 | 28 — Contraintes projet déclarées | s | 607 | 100 % | 0 | 607 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-28 | 28 — Contraintes projet déclarées | m | 618 | 100 % | 0 | 618 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-28 | 28 — Contraintes projet déclarées | l | 618 | 100 % | 0 | 618 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-29 | 29 — Ticket déjà réservé par un autre agent | s | 577 | 100 % | 0 | 577 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-29 | 29 — Ticket déjà réservé par un autre agent | m | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-29 | 29 — Ticket déjà réservé par un autre agent | l | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-30 | 30 — Ticket modifié pendant le travail (brief périmé) | s | 577 | 100 % | 0 | 577 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-30 | 30 — Ticket modifié pendant le travail (brief périmé) | m | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |
| PAY-30 | 30 — Ticket modifié pendant le travail (brief périmé) | l | 588 | 100 % | 0 | 588 | 100 % | 0 | 0 | 100 % | 100 % | prêt (100) | 100 % | ✓ |

## Écarts constatés

Aucun écart : toutes les cibles du contrat sont atteintes.

## Ce qui n’est pas couvert

- **Aucun appel réel** à Jira, Confluence ou Teamwork Graph : tout passe par les
  transports simulés du lot C1 ; les comportements réels d’API (pagination réseau,
  erreurs HTTP authentiques, CQL côté serveur) ne sont pas éprouvés ici.
- **Modèle de condensation non branché** : le harnais utilise le repli `passthrough`
  (texte d’origine) ; la condensation par LLM et ses dérives potentielles (perte de
  source, réécriture infidèle) ne sont pas mesurées.
- **Les mesures portent sur le code** (moteur de brief + score de préparation) exécuté
  hors Forge : ni le rendu dans un site Jira réel, ni les écrans UI, ni les délais
  d’une action Forge (55 s) ne sont couverts par ce rapport.
- `detectInstructionViaModel` (détection d’injection par modèle) n’est pas branché :
  seule la détection déterministe par motifs du socle est en jeu.
- La détection d’« élément inventé » est lexicale (normalisation + couverture de mots) :
  une recomposition fidèle mot à mot mais sémantiquement trompeuse ne serait pas prise.
