# Étape — le brief suit la langue du ticket

## Ce que ça prouve

Deux choses, sur données réelles :

1. **Le brief est rendu dans la langue du ticket.** ITO-1 et ITO-2 sont des
   tickets **anglais** : leur brief est désormais en anglais de bout en bout,
   libellés et dates comprises. Les tickets français (PAY, MOBL) sont
   **inchangés** — et dans les deux langues, le contenu tiers cité (résumé,
   description, commentaires) n'est **jamais** traduit : seuls les libellés
   produits par le moteur changent.

   ```diff
   - # Brief de travail — ITO-1 (budget l, cible ≈ 8000 jetons)
   + # Work brief — ITO-1 (budget l, target ≈ 8000 tokens)
   - _Jira ITO-1 — 11 août 2021_
   + _Jira ITO-1 — 11 August 2021_
   ```

2. **La fidélité tient après ce changement.** Cinq tickets réels re-capturés ×
   trois budgets = 15 briefs, analysés par `scripts/live-fidelity.py` :

| Indicateur | Cible | Résultat |
|---|---|---|
| Éléments analysés | — | 54 |
| Sans source ni date | 0 | **0** |
| Éléments introuvables (inventés) | **0** | **0** |
| Budgets tenus à ±10 % | 100 % | **15 / 15** |
| Troncatures non nommées | 0 | **0** |
| Fuite d'instruction / de secret | 0 | **0** / **0** |
| Contenu écarté signalé | toujours | 3 briefs (PAY-6, pièges semés) |
| Score de préparation cohérent | 100 % | **5 / 5** |
| Durée d'un brief | < 40 s | médiane 1,15 s, max 1,47 s |

## Un fait mesuré au passage

**La condensation par modèle ne se déclenche pas sur ce jeu** : PAY-6, PAY-17 et
MOBL-2 produisent un markdown **identique à l'octet près** avant et après, et
le delta d'ITO-1/ITO-2 est **identique sur les trois budgets** — ce qui exclut la
condensation (elle dépend du plafond, donc du budget) et signe un changement
déterministe de libellés. Aucun élément n'atteint le plafond par budget.

## Rejouer

```bash
curl -s "$URL?token=$PROBE_TOKEN&cmd=full&issue=ITO-1&budgets=s,m,l" > captures/ITO-1.json
python3 scripts/live-fidelity.py captures/ > resultat.json
```

## Ce que ça ne prouve pas

- La capture exige la **sonde** (webtrigger + jeton), démontée depuis : la
  mesure est archivée, pas rejouable en l'état.
- **Rien n'est validé en `asUser`** : la sonde s'exécute en `asApp()`, donc le
  chemin Teamwork Graph reste non exercé — les 5 tickets renvoient toujours
  « voisins : Accès refusé », correctement signalé comme trou et jamais comblé.
- Les tickets testés sont **courts**. Sur un ticket dont un élément dépasserait
  320 jetons, le comportement serait différent (troncature ou condensation) :
  ce cas n'est **pas** couvert par cette mesure.
