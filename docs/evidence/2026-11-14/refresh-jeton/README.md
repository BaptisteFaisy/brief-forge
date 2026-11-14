# Étape — le jeton `asUser` devient renouvelable (et une promesse du 13/11 corrigée)

## Ce que ça prouve

**La preuve `asUser` du 13 novembre n'était pas rejouable, et le README le
disait faux.** Le fichier de jeton ne porte que cinq clés —
`access_token, expires_in, refresh_token, scope, token_type` — **aucun
`client_id`**. Or RFC 6749 § 6 exige le `client_id` pour utiliser un
`refresh_token` : sans lui, le jeton est irrécupérable à la fin de ses 8 h et
il faut rejouer le consentement à la main. Le README de l'étape
[`mcp-asuser`](../../2026-11-13/mcp-asuser/) affirmait « `refresh_token` permet
de le renouveler » : c'était une **promesse**, pas une mesure. Le constat est
dans [`constat-jeton-13-11.txt`](constat-jeton-13-11.txt) — la commande réelle,
sur le vrai fichier, avec son code de sortie.

**La cause n'était pas un oubli de saisie, c'était le dessin du script** :
`scripts/mcp-login.mjs` enregistre un client auprès du serveur d'autorisation
(RFC 7591, « Dynamic Client Registration ») **à chaque exécution**, et
n'écrivait que la réponse aux jetons. Le client était donc perdu avec le
processus.

Trois choses corrigées, toutes vérifiées hors ligne :

| Correction | Ce qu'elle change |
|---|---|
| `scripts/lib/tokenStore.mjs` (nouveau, pur) | Persiste `client_id`, `resource`, `obtenu_a`, `expire_a` avec le jeton, en `0600` hors dépôt. Une seule implémentation de « à quoi ressemble un fichier de jeton », partagée par la connexion et le test de bout en bout — la lecture duale qui existait déjà est supprimée. |
| `node scripts/mcp-login.mjs --refresh` | Renouvelle le jeton stocké **sans navigateur et sans consentement** : le corps de requête est construit depuis le fichier (RFC 6749 § 6). |
| `scripts/mcp-e2e.mjs` écarte un jeton périmé **avant** l'appel | Un 401 compris n'est pas un 401 subi. Code de sortie **1** si le fichier permet de se renouveler seul (la commande exacte est imprimée), **2** si une étape humaine est requise. C'est l'erreur de diagnostic du 12 novembre — « le chemin `asUser` est cassé », pendant une journée — qui ne peut plus être causée par un jeton mort. |

Les deux portes d'entrée sont jouées sur des jetons **fabriqués** dans
[`portes-entree.txt`](portes-entree.txt), et les règles pures dans
[`tests-hors-ligne.txt`](tests-hors-ligne.txt) : 29 assertions du harnais,
48 tests des scripts, **965 tests** sur `main` à la suite.

## Ce que ça ne prouve pas

- **Que le renouvellement fonctionne contre le serveur d'Atlassian.** Aucun
  appel réseau n'a été joué : le jeton du 13/11 est irrécupérable (pas de
  `client_id`) et un consentement neuf exige un clic humain. Le corps de
  requête est conforme à la RFC et vérifié par tests purs — **pas par un
  échange réel**. C'est la limite principale de cette étape.
- **Que le fichier existant est désormais daté.** `~/.config/brief-forge/mcp.token`
  ne porte aucun horodatage : `mcp-e2e.mjs` ne le juge donc pas (aucun
  `expire_a` → aucune alerte, par honnêteté) et il expirera en 401 jusqu'à ce
  qu'un nouveau consentement l'écrive au nouveau format.
- **Que l'item 04 (Teamwork Graph vu par un utilisateur) est avancé.** Il
  attend toujours un jeton vivant et un ticket avec des PR liées. Rien ici ne
  le prouve.
- **Que le consentement devient inutile.** Il reste une étape humaine ; ce
  correctif la rend rare (une fois par la durée de vie du `refresh_token`, non
  mesurée), pas facultative.
- **La durée de vie du `refresh_token`.** Atlassian ne l'annonce dans aucun
  document publié ici ; elle n'est pas mesurée.

## Rejouer

```bash
# 1. Les règles pures, sans réseau ni jeton réel
node test/scripts/harnais-token-store.mjs

# 2. Les tests des scripts (harnais + portes d'entrée hors ligne)
npx jest test/scripts

# 3. Le constat sur le jeton réel du 13/11 (aucune écriture : le script
#    s'arrête avant de toucher le fichier)
node scripts/mcp-login.mjs --refresh --out ~/.config/brief-forge/mcp.token ; echo $?

# 4. Une fois un consentement neuf joué : le renouvellement réel, sans navigateur
node scripts/mcp-login.mjs            # un clic dans le navigateur
node scripts/mcp-login.mjs --refresh  # puis, pendant toute la vie du refresh_token
```
