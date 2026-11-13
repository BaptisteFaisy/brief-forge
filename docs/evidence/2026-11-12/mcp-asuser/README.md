# Étape — le chemin `asUser` : ce qui a été tenté, et ce qui bloque

> **⚠️ Diagnostic corrigé le 13 novembre.** La conclusion de cette étape —
> « bloqué par l'état du tenant », l'app « Not sharing » étant la cause
> racine — **est fausse**. Elle a été vérifiée fausse : le chemin `asUser`
> fonctionne, en production, sur des données réelles. La suite du raisonnement
> est dans [`2026-11-13/mcp-asuser/`](../2026-11-13/mcp-asuser/) :
> - l'exposition MCP se règle **par installation** (Administration du site →
>   Connected apps → l'app → Data management), pas dans la console
>   développeur ;
> - le garde lisait le ticket en *impersonation hors ligne*
>   (`api.asUser(accountId)`), que la plateforme refuse sans scope
>   `allowImpersonation` — d'où un refus pour **tous** les tickets ;
> - les tables SQL n'avaient jamais été créées, donc toute requête échouait.
>
> Ce qui suit est **conservé tel quel** : c'est l'état de la connaissance au
> 12 novembre, et c'est ce qui a conduit au faux diagnostic.


## Ce que ça prouve

J'ai poussé la recherche jusqu'au bout, **avec ton navigateur** (le Chrome
headless déjà connecté à Atlassian sur cette machine). Résultat : le chemin
`asUser` (BC-09) n'est **pas bloqué par l'automatisation**, mais par l'état du
tenant. Trois écrans disent la même chose :

1. **La page de consentement OAuth** (`consentement-oauth.txt`) s'ouvre bien,
   connectée comme `baptiste.faisy@gmail.com`, et affiche la demande de
   `brief-forge-mcp-e2e` pour « Brief de contexte ». Mais :
   > *« Your account isn't associated with a supported site. »*

   Le sélecteur de site est **vide**, et le bouton **Accept est désactivé**.

2. **La fiche de l'app dans l'administration du site** (`admin-site.txt`) est
   cohérente : badge **RUNS ON ATLASSIAN** affiché, et les **nouveaux scopes
   Teamwork Graph** (`Read pull requests via Teamwork Graph`, `Read work items
   via Teamwork Graph`…) y sont **actifs et visibles** — la PR #38 est bien
   appliquée côté site.

3. **La console développeur** (`console-developpeur.txt`) affiche le statut de
   distribution de l'app : **« Not sharing »**. C'est la cause racine : une app
   en mode test, non partagée, n'expose pas ses « tools » à un site.

Le contrôle d'exposition **« Enable tools »** existe bien dans le DOM de
l'onglet Authorization, mais il est **rendu avec une taille nulle** (donc
invisible et incliquable) — il n'est pas proposé tant que l'app n'est pas
partagée.

## Ce que j'ai tenté, dans l'ordre

| Voie | Résultat |
|---|---|
| Flux OAuth complet (DCR + PKCE + échange de code) | **fonctionnel** : l'URL de consentement est réelle, le client est enregistré, le jeton s'échangerait — mais le consentement est refusé (Accept désactivé) |
| Consentement via **ton navigateur** (CDP, clic réel) | l'écran s'ouvre et s'affiche ; il n'y a juste aucun site à autoriser |
| Jeton **machine** (`client_credentials`) | **refusé** par le serveur d'autorisation : `400 invalid_client: grant_type is not enabled for client` |
| Sessions Chrome présentes sur le poste | aucune session Atlassian exploitable pour le site de démo (les profils trouvés appartiennent à d'autres chantiers) |
| Administration du site | « Update » **appliqué** (le site tourne désormais la version déployée) ; les scopes Teamwork Graph sont confirmés actifs ; « Enable tools » non rendu |

## Ce que ça ne prouve pas

- Que le chemin `asUser` est **faux** : rien n'indique un défaut du code. Le
  serveur MCP répond, la découverte OAuth est complète, les 11 outils sont
  exposés par le manifeste, et le bloc `CondenseFn`/port `LlmPort` est agnostique
  du fournisseur (prouvé par le banc InferHub).
- Que la condensation a été prouvée **dans l'app** : elle ne s'est jamais
  déclenchée sur un ticket réel, faute d'élément dépassant le plafond — c'est
  mesuré et consigné dans [Langue du brief](../langue-brief/).

## Ce qui débloquerait

Dans l'ordre, par l'administrateur du tenant :

1. **Partager l'app** (console développeur → « Brief de contexte » →
   *Distribution status* → **Not sharing** → activer le partage) : c'est ce qui
   devrait rendre « Enable tools » disponible ;
2. puis, dans l'admin du site : **Apps → Sites → one-atlas-cndz → Connected
   apps → Brief de contexte → autoriser l'accès MCP** ;
3. enfin le consentement OAuth devient accordable, et la commande existe déjà :
   ```bash
   node scripts/mcp-login.mjs
   node scripts/mcp-e2e.mjs --run --token-file ~/.config/brief-forge/mcp.token
   ```

Tant que (1) n'est pas fait, l'étape est **bloquée par le tenant**, et je
préfère le dire que de la maquiller.
