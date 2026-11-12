# Étape — le modèle hébergé répond dans le runtime Forge

## Ce que ça prouve

`@forge/llm` fonctionne **dans le runtime Forge** — pas seulement sur doublure
dans les tests. La sonde exposait une commande dédiée (`cmd=llm`) qui isole les
quatre étapes dans l'ordre où le moteur les emprunte.

| Mesure | Résultat |
|---|---|
| Modèles exposés par le runtime | **8**, tous `active` |
| Modèle choisi par le moteur | `claude-haiku-4-5-20251001` — le plus économique des `active`, conforme à la règle de choix |
| Repli déclaré | `claude-haiku-4-5` |
| Résolution du modèle | 47 ms |
| Complétion directe | **845 ms** |
| Condensation : 648 jetons, budget 60 | **54 jetons rendus en 861 ms**, `condensed: true` |

## Rejouer

L'artefact vient de la sonde `dev/sonde-live`, **démontée depuis** : le webtrigger
a été supprimé et `PROBE_TOKEN` révoqué (voir
[démontage de la sonde](../nettoyage-sonde/)). La mesure n'est donc plus
rejouable en l'état ; elle repose sur la branche locale `dev/sonde-live`, qui
contient encore `src/dev/probeLlm.ts` et la commande `cmd=llm`.

## Ce que ça ne prouve pas

- **Aucun brief réel n'a déclenché de condensation.** Le moteur n'appelle le
  modèle que si un élément dépasse le plafond par budget (80 / 160 / 320
  jetons) : aucun élément des tickets du site de démo n'atteint ce seuil. Les
  markdowns sont donc restés identiques à l'octet près (voir
  [langue du brief](../langue-brief/)). La condensation est branchée et
  fonctionnelle, mais **inerte sur ce jeu de données**.
- Le coût n'est pas nul : l'API Forge LLMs **n'a aucun quota gratuit** (tout est
  facturé au développeur de l'app). Deux appels de mesure ont coûté ≈ 0,0018 $.
  C'est pour cela que la condensation est **éteinte par défaut** et ne s'allume
  que sur `BRIEF_LLM_CONDENSATION=1` (voir [déploiements](../deploiements/)).
- Cette preuve porte sur le modèle **hébergé par Atlassian**, pas sur un
  fournisseur tiers (voir [banc InferHub](../banc-inferhub/)).
