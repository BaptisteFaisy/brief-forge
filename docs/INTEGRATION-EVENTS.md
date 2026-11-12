# Câblage des événements — trigger planifié, verrou, scopes Teamwork Graph

> **Câblage effectué dans cette PR** : `manifest.yml` (fonction
> `brief-rebuild-sched-fn`, `scheduledTrigger` `brief-rebuild-scheduled`, scopes
> `read:graph:*`), `src/index.ts` (handler `briefRebuildScheduled`) et les
> fichiers générés (§ 5). Ce document garde la trace des **choix** et des
> **réserves tranchées** ; il ne reste rien à câbler à la main.

## 1. Trigger planifié de secours — bloc inséré dans `manifest.yml`

### 1.1 Dans `modules:` (à côté de `consumer:`)

```yaml
  scheduledTrigger:
    - key: brief-rebuild-scheduled
      function: brief-rebuild-sched-fn
      interval: hour   # minute 0 de chaque heure : rattrapage horaire des briefs périmés
```

### 1.2 Dans `modules.function:` (la liste existante)

```yaml
    - key: brief-rebuild-sched-fn
      handler: index.briefRebuildScheduled
```

### ✅ Deux réserves de conformité, tranchées au câblage

1. **Longueur de la clé de fonction.** La consigne du lot impose une clé de
   fonction **< 24 caractères** (constat cohérent avec le manifeste actuel :
   la clé la plus longue fait 23 caractères, ex. `issue-commented-trigger`).
   `brief-rebuild-scheduled-fn` en faisait **26** → variante conforme retenue :
   **`brief-rebuild-sched-fn`** (22 caractères). La clé du `scheduledTrigger`
   (`brief-rebuild-scheduled`, 23 caractères) ne bouge pas.
   *À noter : le schéma n'impose pas cette limite (`ExtensionKey` accepte
   jusqu'à 255 caractères) — c'est une convention du dépôt, respectée quand
   même.*

2. **Forme de `interval`.** Le schéma installé ici (`@forge/manifest` 13.9.0,
   `out/schema/manifest-schema.json`) n'accepte pour `interval` que l'énumération
   `fiveMinute | hour | day | week` — pas d'objet `cron`, et
   `additionalProperties: false` rejette la forme objet. **Repli retenu :
   `interval: hour`**, de sémantique identique (`0 */1 * * *` = minute 0 de
   chaque heure). La forme `interval.cron` demandée par la mission suppose un
   CLI plus récent que celui installé ici.

## 2. Handler exporté dans `src/index.ts`

La logique vit dans `src/events/staleDrain.ts` (`drainStaleBriefs`) avec son
câblage Forge dans `src/events/index.ts` (`runScheduledDrain`, déjà exporté).
Ajouté dans `src/index.ts` :

```ts
import { defaultEventHandlers, runConsumerForEvent, runScheduledDrain } from './events';

/** Trigger planifié `brief-rebuild-scheduled` : rattrape les briefs encore
 *  périmés (message de file perdu, consumer en échec). */
export async function briefRebuildScheduled(): Promise<void> {
  await runScheduledDrain();
}
```

(Le nom `briefRebuildScheduled` doit matcher `handler: index.briefRebuildScheduled`.)

Comportement : liste les tickets dont un brief stocké est périmé
(`SELECT DISTINCT issue_key FROM brief WHERE stale = 1` via `getSqlClient()`
et `TABLES` **déjà exportés** par `src/storage` — aucune modification du lot
stockage), les remet en file avec la raison `scheduled-drain`, puis rejoue
`consumeBriefQueue` : budget de temps existant (96 s par défaut), plafond de
tickets, verrou par ticket et contrôle de fraîcheur inclus — **zéro logique
dupliquée**. Un système sain coûte un SELECT par heure et rien d'autre.

> Suggestion au lot stockage : exposer un `listStaleBriefIssueKeys()` dans
> `src/storage/index.ts` ; remplacer alors le corps de
> `createForgeStaleBriefLister()` (`src/events/index.ts`) par cet appel.

## 3. Scopes Teamwork Graph à ajouter à `permissions.scopes`

Noms issus de la liste officielle embarquée par `@forge/manifest` 13.9.0
(`out/scopes/teamwork-graph-scopes.json`) — ce sont ceux que connaît le
linter (`teamwork-graph-scopes`).

```yaml
permissions:
  scopes:
    # ... scopes existants inchangés ...
    - read:graph:issue:jira
    - read:graph:issue-remote-link:jira
    - read:graph:pull-request:external
    - read:graph:commit:external
    - read:graph:repository:external
    - read:graph:user:atlassian
```

Justification, scope par scope :

| Scope | Pourquoi |
|---|---|
| `read:graph:issue:jira` | Nœuds d'entrée de la requête `developmentChanges` : le ticket lui-même et ses tickets liés (`linkedKeys`). |
| `read:graph:issue-remote-link:jira` | Arêtes Jira ↔ objets de développement : c'est par les remote links (posés par les intégrations dev) que le graphe rattache PR/commits à un ticket. |
| `read:graph:pull-request:external` | Les PR voisines **et leur état** (`MERGED`, `DECLINED`, `CLOSED`, `OPEN`, `DRAFT`) — cœur de l'exigence § 7.1 rang 5 ; sans lui, pas de « PR refusée » exploitable dans « Déjà tenté ». |
| `read:graph:commit:external` | Les commits voisins (§ 7.1 rang 5). |
| `read:graph:repository:external` | Les dépôts qui portent PR et commits (parcours du graphe, contexte affiché). |
| `read:graph:user:atlassian` | Le champ `author { name }` de la requête : les auteurs sont des comptes Atlassian ; sans ce scope l'auteur peut revenir illisible (« inconnu »). |

Optionnel, **non** demandé par la requête actuelle : `read:graph:branch:external`
(uniquement si on lit un jour les branches).

Rappel vérifié dans les types `@forge/api` 8.5.0 : `requestTeamworkGraph`
(`TeamworkGraphFetchMethods`) n'est inclus que dans `AsUserFetchMethods` —
**pas** dans `AsAppFetchMethods`. L'appel se fait donc au nom de l'utilisateur
(`graphTransport()` → `asUser()` dans `src/collect/issueCollector.ts`) : c'est
intact et à conserver. C'est cohérent avec le 403 observé sur le site de démo
tant que les scopes `read:graph:*` manquent.

**Validation** :
1. `forge lint` → le warning `teamwork-graph-scopes` doit disparaître, sans
   nouveau warning ;
2. `forge deploy` puis `forge install --upgrade` sur le site de démo (le
   consentement aux nouveaux scopes se rejoue à l'upgrade) ;
3. passer un ticket au statut déclencheur et vérifier dans les logs Forge :
   appel graphe sans 403, section « Changements voisins » du brief avec des
   états en français (`[mergée]`, `[refusée]`…) ;
4. si le graphe reste muet, le repli dev-status s'applique (voir § 5).

## 4. Verrou d'idempotence du consumer — mécanisme retenu (documentation)

Code : `src/events/buildLock.ts` ; intégration : `src/events/consumer.ts`
(aucun câblage à faire dans `src/index.ts` — `resolveConsumerDeps` fournit le
verrou par défaut).

- **Granularité** : un verrou **par ticket**, clé GlobalStorage
  `brief-forge:build-lock:<ISSUE-KEY>`, enregistrement
  `{ issueKey, owner (UUID), acquiredAt, expiresAt }`.
- **Expiration** : `BUILD_LOCK_TTL_MS = 5 min`. Choix : le consumer construit
  les trois budgets d'un ticket dans un budget de lot de 96 s
  (`DEFAULT_CONSUMER_TIME_BUDGET_MS = 0,8 × BRIEF_FRESHNESS_TARGET_MS`) —
  5 min couvrent largement un build en cours (le verrou ne saute pas au milieu)
  et un consumer planté (pas de `finally` joué) ne bloque le ticket que 5 min.
  Un test verrouille l'invariant `TTL > budget de temps du lot`.
- **Libération** : dans un `finally` du consumer ; seul le propriétaire
  (`owner`) peut effacer son verrou — un verrou expiré puis repris par un autre
  n'est jamais effacé par le premier.
- **Échec du verrou = fail-open** : si GlobalStorage tombe, la construction
  continue (journalisée) ; le contrôle de fraîcheur du consumer reste la
  barrière de fond contre les doublons.
- **Consumer perdant** : statut `locked`, l'entrée **reste en file** (aucune
  tentative consommée) ; elle sera reprise au lot suivant ou par le drain
  planifié (§ 2).
- **Limite assumée** : l'API clé/valeur Forge n'a pas de comparaison-échange
  atomique. L'acquisition est « lire → décider → écrire » + relecture de
  confirmation (perdant détecté quand son `owner` a été écrasé), et les
  acquisitions d'un même isolate sont sérialisées (deux consumers simultanés
  dans une même exécution : déterministe). C'est la même convention que la
  déduplication de `queue.ts`. Entre deux invocations Forge distinctes, une
  course résiduelle étroite subsiste : son pire effet est une construction en
  double (sans corruption) — exactement le coût que le verrou réduit, pas un
  risque nouveau.

## 5. Fichiers générés régénérés par les tests (commités dans cette PR)

Deux fichiers **suivis** sont réécrits par la suite de tests elle-même (ni par
moi directement, ni modifiables dans mon lot) :

- `docs/FIDELITY-REPORT.md` — régénéré par `npm run fidelity` avec la **date du
  jour** et, effet du lot, les jetons de PAY-24 passent de 650/661/661 à
  651/662/662 (`[OPEN]` → `[ouverte]`, +3 caractères). Toutes les cibles
  restent ✓ (92/92). J'ai **restauré la version suivie** après validation ;
  au merge, relancer `npm run fidelity` et committer le rapport régénéré.
- `site/assets/data.json` — régénéré par `test/integration/export-site.test.ts`
  à chaque `npx jest` complet ; seul changement : `[MERGED]` → `[mergée]` dans
  les markdowns des trois budgets CMD-1. J'ai **restauré la version suivie** ;
  au merge, relancer `npm run site-data` (ou `npx jest`) et committer.

## 6. Repli dev-status (rappel, inchangé)

La normalisation des états s'applique **aussi** au repli « information de
développement Jira » (`parseDevStatusChanges`) : une PR `DECLINED` y devient
`refusée` comme dans le graphe (une seule table de libellés,
`CHANGE_STATE_LABELS`). Le 403 observé sur le site réel pour
`/rest/dev-status/latest/issue/detail` n'est couvert par aucun scope dédié
(`read:jira-work` est déjà déclaré) ; il dépend de l'activation des
intégrations de développement sur le site. Le code le gère déjà en repli doux
(liste vide journalisée, jamais d'échec du brief). À re-vérifier après ajout
des scopes `read:graph:*` : le chemin primaire (graphe) devrait alors suffire.
