# Branche de sonde — **jamais mergée dans `main`**

Cette branche sert à **mesurer** l'app en conditions réelles : c'est elle qui
porte le module `webtrigger` `dev-probe` (token-gaté) et la commande `cmd=llm`
qui prouve que `@forge/llm` répond dans le runtime Forge.

## Pourquoi elle est à part

Un **webtrigger fait perdre l'éligibilité *Runs on Atlassian***. `main` ne
contient donc **ni `src/dev/` ni de module `webtrigger`** : il reste éligible,
et c'est lui qui est déployé en `staging` et `production`. Cette branche est
l'instrument, jamais le produit.

> **Ne fusionnez pas cette branche dans `main`.** Elle existe pour être
> déployée sur `development`, mesurée, puis démontée (webtrigger supprimé,
> `PROBE_TOKEN` révoqué).

## Ce qu'elle contient

| Fichier | Rôle |
|---|---|
| `src/dev/probe.ts` | dispatch des commandes de la sonde (`schema`, `jql`, `collect`, `brief`, `readiness`, `store`, `comment`, `seed`, `scan`, `full`, `llm`) |
| `src/dev/probeLive.ts` | énumération et capture multi-tickets |
| `src/dev/probeLlm.ts` | `cmd=llm` : prouve le chemin modèle dans le runtime Forge |
| `src/dev/probeTypes.ts` | types et utilitaires partagés |

## Utilisation

```bash
git switch dev/sonde-live
forge-atlassian variables set PROBE_TOKEN "<jeton aléatoire>" --encrypt -e development
forge-atlassian deploy -e development --non-interactive --approve MAJOR_VERSION_RULE
forge-atlassian install --upgrade -e development -p jira -s <site>.atlassian.net --non-interactive --confirm-scopes
forge-atlassian webtrigger create --functionKey dev-probe -s <site>.atlassian.net -p jira -e development

curl -s "$URL?token=$PROBE_TOKEN&cmd=llm&repeats=12&budget=60"
```

Le jeton n'est jamais écrit dans le dépôt ; il vit dans une variable Forge
chiffrée, et il est révoqué à la fin.

## Démontage

```bash
forge-atlassian webtrigger delete --url "$URL" -e development
forge-atlassian variables unset PROBE_TOKEN -e development
git switch main && forge-atlassian deploy -e development --non-interactive
```

Les preuves ainsi obtenues sont versionnées dans
`docs/evidence/2026-11-12/` (voir `docs/PREUVES.md`).
