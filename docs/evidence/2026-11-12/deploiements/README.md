# Étape — déploiements et porte LLM

## Ce que ça prouve

1. **`main` est déployé sur `development` en v5.5.0** — les neuf PR de la
   session y sont.
2. **L'app déployée est éligible *Runs on Atlassian*** : elle ne fait aucune
   sortie réseau hors Atlassian, et le module `llm` est hébergé par Atlassian.
3. **La condensation par modèle est allumée sur `development` uniquement** :
   `BRIEF_LLM_CONDENSATION=1` y est posé, et `staging` comme `production` n'ont
   **aucune variable**. C'est la preuve directe de la décision « 1 = A ».

## Les chiffres

| Environnement | Dernier déploiement | `BRIEF_LLM_CONDENSATION` |
|---|---|---|
| `development` | 12 novembre, 13:54 UTC | **1** |
| `staging` | 11 novembre, 15:00 UTC | aucune variable |
| `production` | 11 novembre, 21:34 UTC | aucune variable |

Éligibilité : *« The version of your app [5.5.0] that's deployed to
[development] is eligible for the Runs on Atlassian program. »*

## Rejouer

```bash
forge-atlassian environments list
forge-atlassian eligibility
forge-atlassian variables list -e development
forge-atlassian variables list -e staging
forge-atlassian variables list -e production
```

## Ce que ça ne prouve pas

- **`staging` et `production` ne sont pas à jour** : elles sont encore au
  11 novembre, avant les neuf PR. Le tableau ci-dessus le dit, mais c'est la
  chose à ne pas rater.
- L'éligibilité affichée ne vaut que pour l'environnement `development`.
- Rien de tout cela ne prouve que la condensation se déclenche : elle ne se
  déclenche sur aucun ticket du site de démo (voir
  [trigger planifié](../trigger-planifie/) et
  [modèle hébergé Forge](../llm-forge/)).
