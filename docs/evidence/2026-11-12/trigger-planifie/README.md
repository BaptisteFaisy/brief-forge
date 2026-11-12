# Étape — trigger planifié : le bug, puis sa correction

## Ce que ça prouve

Ce fichier unique contient **le défaut et sa correction**, côte à côte. C'est la
preuve la plus directe du pack : on voit l'erreur, puis on voit le même
déclenchement horaire se dérouler sans elle.

| Invocation | Ce qu'elle montre |
|---|---|
| 10:49:32 UTC | `Drain planifié : tickets périmés remis en file { stale: 0, enqueued: 0 }` puis **ERROR** `APIError: Request principal is not authorized to use storage resource` (à `StorageBriefQueue.list`) |
| 11:49:32 UTC | `Drain planifié : aucun brief périmé, rien à reconstruire { stale: 0 }` — **plus d'erreur** |
| 12:49:32 UTC | idem, propre |
| 13:49:32 UTC | idem, propre |
| 14:49:32 UTC | idem, propre |

## Ce que le bug était

Un `scheduledTrigger` s'exécute **sans contexte d'installation** : Forge SQL y
fonctionne, mais le **stockage global y est refusé**. Le drain rejouait le
consumer, qui commence par lire la file persistante → une erreur **toutes les
heures**, sur un déploiement par ailleurs parfaitement sain.

Correction : plus rien de périmé → un SELECT et rien d'autre ; quelque chose de
périmé → une file en mémoire amorcée par la liste SQL, le consumer restant
inchangé. PR #41, `src/events/memoryQueue.ts` et `src/events/staleDrain.ts`.

## Rejouer

```bash
forge-atlassian logs -e development -f brief-rebuild-sched-fn -s 8h -n 60
```

## Ce que ça ne prouve pas

- **Le chemin de reconstruction n'a pas été exercé en direct** : `stale: 0` à
  chaque exécution, donc rien n'a jamais eu besoin d'être reconstruit. Ce qui est
  prouvé, c'est le *drain sain* et l'absence d'erreur — pas la reconstruction
  elle-même (couverte par les tests, `test/events/staleDrain.test.ts`, dont le
  harnais utilise une file **interdite d'accès** qui lève l'erreur réelle).
- Une exécution horaire propre ne prouve pas la stabilité dans le temps : le
  correctif est récent, la série visible ici couvre quatre cycles.
- Ces logs sont ceux de `development` ; `production` n'a pas ce déclencheur
  déployé.
