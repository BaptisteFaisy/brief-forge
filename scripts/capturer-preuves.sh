#!/usr/bin/env bash
# Capture les preuves vivantes du 12 novembre 2026 dans
# `docs/evidence/2026-11-12/`, une dossier par étape.
#
# Règles :
# - chaque artefact porte un **en-tête de provenance** (date, commande, SHA) :
#   une preuve sans provenance n'est pas une preuve ;
# - une commande qui échoue n'interrompt pas la capture : l'échec est écrit dans
#   le fichier (`ÉCHEC`), pour qu'une preuve manquante soit **visible** ;
# - les codes couleur ANSI sont retirés (un artefact lisible avant tout) ;
# - aucun secret n'est écrit : les jetons viennent de l'environnement et ne
#   sont jamais imprimés.
#
# Rejouable : `bash scripts/capturer-preuves.sh`.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAQUET="$RACINE/docs/evidence/2026-11-12"
SITE="one-atlas-cndz.atlassian.net"
JOUR="${PREUVES_DATE:-$(date '+%Y-%m-%d %H:%M:%S %Z')}"

cd "$RACINE" || exit 1

# En-tête de provenance + sortie de la commande.
ecrire() {
  local chemin="$1" commande="$2"
  shift 2
  mkdir -p "$(dirname "$chemin")"
  {
    echo "# Provenance"
    echo "- Date : $JOUR"
    echo "- Commande : \`$commande\`"
    echo "- Dépôt : $(basename "$RACINE") @ $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
    echo
  } > "$chemin"
  if [ "$#" -eq 0 ]; then
    echo "(aucune commande : artefact fourni par le dépôt)" >> "$chemin"
  else
    "$@" >> "$chemin" 2>&1 || echo "(ÉCHEC : la commande a rendu un code non nul — voir la sortie ci-dessus)" >> "$chemin"
  fi
  nettoyer "$chemin" > "$chemin.tmp" && mv "$chemin.tmp" "$chemin"
}

# Artefact déjà produit pendant la journée : on le recopie, ou on le signale.

# Commande Forge : certaines exigent un TTY, on le simule.
forge_tty() {
  script -qec "$1" /dev/null
}

# Les codes couleur ANSI et les séquences de contrôle des spinners ne sont pas
# des artefacts lisibles : on retire tout ce qui est non imprimable, et les
# lignes de progression de la CLI.
nettoyer() {
  sed -e 's/\x1b\[[0-9;?]*[a-zA-Z]//g' \
      -e 's/\x1b\][^\x07]*\(\x07\|\x1b\\\)//g' \
      -e 's/\r/\n/g' \
      -e '/^[[:space:]]*$/d' \
      -e '/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏][[:space:]]*$/d' \
      -e '/Fetching environments/d' \
      -e '/Press Ctrl+C to cancel/d' \
      -e '/Environments fetched/d' "$1"
}
# Artefact déjà produit pendant la journée : on le recopie, ou on le signale.
# Un artefact JSON reste du JSON : la provenance y entre comme clé, elle ne
# précède pas la donnée.
archiver() {
  local chemin="$1" source="$2" origine="$3"
  mkdir -p "$(dirname "$chemin")"
  if [ ! -f "$source" ]; then
    {
      echo "# Provenance"
      echo "- Date : $JOUR"
      echo "- Origine : $origine"
      echo
      echo "(NON DISPONIBLE : \`$source\` n'existe plus — artefact non rejouable,"
      echo "la source ayant été démontée ou le tampon effacé. Voir le README de l'étape.)"
    } > "$chemin"
    return
  fi
  if [ "${chemin##*.}" = "json" ]; then
    python3 - "$source" "$chemin" "$JOUR" "$origine" <<'PY'
import json, sys
source, cible, jour, origine = sys.argv[1:5]
try:
    donnees = json.load(open(source, encoding='utf-8'))
except Exception as erreur:
    donnees = {'erreur': 'source illisible : %s' % erreur}
with open(cible, 'w', encoding='utf-8') as sortie:
    json.dump(
        {
            'provenance': {
                'date': jour,
                'origine': origine,
                'source': source,
                'note': 'source hors dépôt, régénérée pendant la session',
            },
            'mesure': donnees,
        },
        sortie,
        ensure_ascii=False,
        indent=1,
    )
PY
    return
  fi
  {
    echo "# Provenance"
    echo "- Date : $JOUR"
    echo "- Origine : $origine"
    echo "- Source : \`$source\` (hors dépôt, régénéré pendant la session)"
    echo
    cat "$source"
  } > "$chemin"
  nettoyer "$chemin" > "$chemin.tmp" && mv "$chemin.tmp" "$chemin"
}

echo "== 1. déploiements =="
ecrire "$PAQUET/deploiements/environnements.txt" \
  "forge-atlassian environments list" \
  bash -c "script -qec 'forge-atlassian environments list' /dev/null"
ecrire "$PAQUET/deploiements/eligibilite.txt" \
  "forge-atlassian eligibility" \
  bash -c "script -qec 'forge-atlassian eligibility' /dev/null"
{
  echo "# Provenance"
  echo "- Date : $JOUR"
  echo "- Commande : \`forge-atlassian variables list -e {development,staging,production}\`"
  echo
} > "$PAQUET/deploiements/porte-llm.txt"
{
  for env in development staging production; do
    echo "== $env =="
    script -qec "forge-atlassian variables list -e $env" /dev/null 2>&1
    echo
  done
} | nettoyer /dev/stdin >> "$PAQUET/deploiements/porte-llm.txt"

echo "== 2. trigger planifié =="
ecrire "$PAQUET/trigger-planifie/logs-drain.txt" \
  "forge-atlassian logs -e development -f brief-rebuild-sched-fn -s 8h -n 60" \
  bash -c "script -qec 'forge-atlassian logs -e development -f brief-rebuild-sched-fn -s 8h -n 60' /dev/null"

echo "== 3. serveur MCP =="
ecrire "$PAQUET/mcp-e2e/decouverte-mcp.txt" \
  "node scripts/mcp-e2e.mjs --discovery" node scripts/mcp-e2e.mjs --discovery
ecrire "$PAQUET/mcp-e2e/selftest-outils.txt" \
  "node scripts/mcp-e2e.mjs --selftest" node scripts/mcp-e2e.mjs --selftest

echo "== 4. banc InferHub =="
if [ -n "${INFERHUB_API_KEY:-}" ]; then
  ecrire "$PAQUET/banc-inferhub/sortie-banc.txt" \
    "INFERHUB_LIVE=1 npx jest test/llm/banc-inferhub.test.ts --silent=false" \
    env INFERHUB_LIVE=1 npx jest test/llm/banc-inferhub.test.ts --maxWorkers=1 --silent=false
else
  archiver "$PAQUET/banc-inferhub/sortie-banc.txt" /tmp/banc5.log \
    "sortie du banc InferHub (session du 12/11) — le jeton n'est pas dans l'environnement, la capture n'est donc pas rejouable ici"
fi

echo "== 5. modèle hébergé Forge =="
archiver "$PAQUET/llm-forge/probe-llm.json" /tmp/llm-probe.json \
  "sortie de la sonde \`cmd=llm\` (session du 12/11 au matin) — sonde démontée depuis, artefact non rejouable"

echo "== 6. langue du brief =="
archiver "$PAQUET/langue-brief/fidelite-recapture.json" /tmp/fid2.json \
  "sortie de \`scripts/live-fidelity.py\` sur les 5 tickets re-capturés (session du 12/11)"
if [ -d /tmp/live-captures ] && [ -d /tmp/live-captures-2 ]; then
  python3 - > "$PAQUET/langue-brief/diff-ito.txt" <<'PY'
import json, difflib
print("# Provenance")
print("- Date : capture du 12/11")
print("- Comparaison : 5 tickets re-capturés avant / après la PR #34 (langue du ticket)")
print()
for cle in ('ITO-1', 'ITO-2'):
    avant = (json.load(open('/tmp/live-captures/%s.json' % cle))['briefs']['l']['markdown']).splitlines()
    apres = (json.load(open('/tmp/live-captures-2/%s.json' % cle))['briefs']['l']['markdown']).splitlines()
    print('==== %s ====' % cle)
    n = 0
    for ligne in difflib.unified_diff(avant, apres, lineterm='', n=0):
        if ligne.startswith(('---', '+++', '@@')):
            continue
        print(ligne[:170])
        n += 1
        if n > 14:
            print('  …')
            break
    print()
PY
else
  echo "(captures indisponibles)" > "$PAQUET/langue-brief/diff-ito.txt"
fi

echo "== 7. démontage de la sonde =="
archiver "$PAQUET/nettoyage-sonde/sonde-404.txt" /tmp/probe-mort.txt \
  "réponse HTTP de l'URL de la sonde après suppression du webtrigger (session du 12/11)"
ecrire "$PAQUET/nettoyage-sonde/webtrigger-list.txt" \
  "forge-atlassian webtrigger list -e development" \
  bash -c "script -qec 'forge-atlassian webtrigger list -e development -s $SITE -p jira' /dev/null"

echo
echo "== artefacts écrits =="
find "$PAQUET" -type f | sort | sed "s|$RACINE/||"
