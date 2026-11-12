# Étape — serveur MCP en conditions réelles

## Ce que ça prouve

Le serveur MCP de l'app répond sur le **vrai point d'entrée Atlassian**, et
expose exactement les 11 outils que le contrat exige.

### Découverte OAuth (sans jeton, réseau réel)

- point d'accès : `https://mcp.atlassian.com/forge/08a89a5d-…`
- serveur d'autorisation : `https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3`
- `token_endpoint` : `https://auth.atlassian.com/oauth/token`
- `code_challenge_methods_supported` : `S256`
- `grant_types_supported` : `authorization_code`, `refresh_token`, `urn:ietf:params:oauth:grant-type:token-revoke`, …
- scopes annoncés : `read:jira-work`, `write:jira-work`, `read:all:twg`, `write:all:twg`, …

### Auto-contrôle hors ligne de l'outil

- *« liste fidèle au manifeste : aucun écart signalé »*
- *« liste abîmée : 2 écart(s) détecté(s), comme attendu »*
- *« 11 outils exposés, comme le contrat l'exige »*

Le comparateur est testé **avec une liste volontairement abîmée** : s'il ne
détectait rien, le contrôle ne vaudrait rien.

## Rejouer

```bash
node scripts/mcp-e2e.mjs --discovery   # réseau réel, sans jeton
node scripts/mcp-e2e.mjs --selftest    # hors ligne
```

## Ce que ça ne prouve pas

- **Aucun appel d'outil n'a été exécuté.** `--discovery` s'arrête à la
  découverte ; `--check` et `--run` exigent un jeton utilisateur, donc un
  consentement OAuth dans un navigateur. C'est une étape **humaine**, à faire
  dans le cadre de `docs/MCP-E2E.md` § 7.
- L'identité `asUser` (BC-09) et le chemin Teamwork Graph **restent donc
  non validés en direct** : ils ne peuvent l'être que via ce client MCP
  authentifié.
- La découverte prouve que le serveur est joignable et correctement déclaré,
  pas qu'un outil répond correctement.
