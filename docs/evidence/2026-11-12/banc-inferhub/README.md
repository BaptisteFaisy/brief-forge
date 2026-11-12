# Étape — banc de condensation sur un fournisseur tiers

## Ce que ça prouve

1. **Le pipeline de condensation est agnostique du fournisseur.** Le banc
   (`test/llm/banc-inferhub.test.ts`) exerce la **vraie** tuyauterie du projet —
   `boundInput`, `condenseSystemPrompt`/`condenseUserPrompt`, `resolveModel`,
   `createLlmClient`, `cleanModelAnswer`, `keepAttributable`, repli sur le texte
   d'origine — en ne remplaçant que le transport (`LlmPort`). C'est la preuve que
   le contrat § 4.2 (`CondenseFn`) tient sa promesse de portabilité.
2. **Un fournisseur tiers peut être ~90× moins cher** : l'API InferHub annonce
   ≈ 0,00001 $ par appel, contre ≈ 0,0009 $ pour le modèle hébergé d'Atlassian
   (Haiku 4.5, 1 $/M en entrée et 5 $/M en sortie).
3. **Le raisonnement est le piège.** Les deux modèles testés raisonnent par
   défaut, et le raisonnement dévore le budget de sortie :

| | raisonnement ON | raisonnement OFF |
|---|---|---|
| `combo/cheap` | 87 s, 3 546 jetons de raisonnement | — |
| MiniMax M3.1 Flash | 9,9 s, **0 caractère utile** (tout le budget brûlé) | **2,7 s**, résumé correct |

4. **Le repli a tenu à chaque fois** : une route lente ou en panne rend le texte
   d'origine, sans qu'aucune erreur ne remonte au brief. C'est le comportement
   voulu, et il est vérifié par deux tests dédiés (panne du fournisseur,
   réponse hors sujet jetée).

## Coût de la session

≈ 0,0001 $ au total (une poignée d'appels), soit **moins d'un dixième de
centime**.

## Rejouer

```bash
export INFERHUB_API_KEY=…          # jamais écrite ni imprimée
export INFERHUB_LIVE=1
npx jest test/llm/banc-inferhub.test.ts --silent=false
```

Sans `INFERHUB_LIVE=1`, la suite est **ignorée** : la CI n'appelle jamais un
fournisseur externe.

## Ce que ça ne prouve pas

- **Ça ne convient pas à la production** : la latence mesurée va de ~2,7 s
  (route chanceuse) à **plus de 48 s** (fournisseur saturé), alors que le
  timeout client de production est de **8 s** et l'action MCP plafonnée à
  **55 s**. Un condenseur de 48 s ferait exploser la promesse « brief en
  < 40 s ».
- **Brancher InferHub dans l'app déployée ferait perdre le badge *Runs on
  Atlassian*** : la documentation exige « must not egress data », et le
  contenu des tickets partirait chez un fournisseur choisi par enchère, sans
  les contrôles de modération d'Atlassian. Le banc reste donc **hors de
  l'app** : c'est un banc local, dans le dépôt, jamais appelé par le code
  déployé.
- La qualité rédactionnelle n'est pas au niveau de Claude : MiniMax a glissé un
  mot chinois dans un texte français demandé en français.
- Les données envoyées sont les descriptions **fabriquées** du site de
  démonstration. PAY-6 est exclu (il porte les pièges semés, dont un faux
  jeton) et tout texte ressemblant à un secret est refusé avant envoi.
