#!/usr/bin/env bash
# scripts/deploy-check.sh — Contrôles pré-déploiement brief-forge
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"
FAILURES=0

report() {
  local s="$1" c="$2" d="$3"
  printf "  %-4s | %-30s | %s\n" "$([[ "$s" == "OK" ]] && echo "✓ OK" || echo "✗ KO")" "$c" "$d"
  [[ "$s" == "OK" ]] || FAILURES=$((FAILURES + 1))
}

check_node() {
  local nb="${HOME}/.local/node24/bin/node"
  [[ -x "${nb}" ]] || nb="$(command -v node || true)"
  local v="$("${nb}" --version 2>/dev/null || true)"
  if [[ "${v}" =~ ^v24\.(2[2-9]|[3-9][0-9]) ]] || [[ "${v}" =~ ^v22\.(2[3-9]|[3-9][0-9]) ]] || [[ "${v}" =~ ^v26\.(1[2-9]|[2-9][0-9]) ]]; then
    report "OK" "Node conforme" "${v} (${nb})"
  else
    report "KO" "Node conforme" "Version '${v}' non conforme (^22.23.4 || ^24.22.1 || >=26.12.1)"
  fi
}

check_forge_cli() {
  local cb="${HOME}/.local/bin/forge-atlassian"
  [[ -x "${cb}" ]] || cb="$(command -v forge-atlassian || true)"
  local ver="$("${cb}" --version 2>/dev/null || true)"
  [[ -n "${ver}" ]] && report "OK" "forge-atlassian exécutable" "v${ver} (${cb})" || report "KO" "forge-atlassian exécutable" "introuvable ou erreur"
}

check_foundry() {
  local fb="${HOME}/.local/bin/forge"
  [[ -x "${fb}" ]] || fb="$(command -v forge || true)"
  local out="$("${fb}" --version 2>/dev/null || true)"
  if echo "${out}" | grep -qiE "solidity|foundry|forge Version"; then
    report "OK" "Foundry (forge) intact" "$(echo "${out}" | head -1) (${fb})"
  else
    report "KO" "Foundry (forge) intact" "Binaire non Foundry"
  fi
}

check_manifest() {
  [[ -f "manifest.yml" ]] || { report "KO" "manifest.yml présent" "Fichier absent"; return; }
  python3 -c "import yaml; yaml.safe_load(open('manifest.yml'))" 2>/dev/null \
    && report "OK" "manifest.yml YAML lisible" "Syntaxe YAML valide" \
    || report "KO" "manifest.yml YAML lisible" "Erreur d'analyse YAML"
}

check_app_id() {
  local id="$(python3 -c "import yaml; print(yaml.safe_load(open('manifest.yml')).get('app',{}).get('id',''))" 2>/dev/null || true)"
  local re='^ari:cloud:ecosystem::app/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  [[ "${id}" =~ ${re} ]] && report "OK" "app.id format ARI" "${id}" || report "KO" "app.id format ARI" "Format invalide: '${id}'"
}

check_actions() {
  local r="$(python3 -c "
import yaml
m = yaml.safe_load(open('manifest.yml'))
actions = [a['key'] for a in m.get('modules',{}).get('action',[])]
tools = m.get('modules',{}).get('rovo:mcp',[])[0].get('tools',[])
print('OK|11 actions alignées dans rovo:mcp' if len(actions)==11 and set(actions)==set(tools) else f'KO|actions={len(actions)} tools={len(tools)}')
" 2>/dev/null || echo "KO|Erreur")"
  report "${r%%|*}" "11 actions rovo:mcp" "${r#*|}"
}

check_functions() {
  local r="$(python3 -c "
import yaml
m = yaml.safe_load(open('manifest.yml')).get('modules',{})
fkeys = {f['key'] for f in m.get('function',[])}
missing = [a['key'] for a in m.get('action',[]) if a.get('function') not in fkeys]
print('OK|action.function déclarées dans modules.function' if not missing else f'KO|Manquantes: {missing}')
" 2>/dev/null || echo "KO|Erreur")"
  report "${r%%|*}" "action.function déclarées" "${r#*|}"
}

check_handlers() {
  local r="$(python3 -c "
import yaml, re
m = yaml.safe_load(open('manifest.yml')).get('modules',{})
handlers = [f['handler'] for f in m.get('function',[])]
src = open('src/index.ts').read()
miss = [h for h in handlers if not re.search(rf'\bexport\s+(?:async\s+)?(?:const|function)\s+{h.split(\".\")[-1]}\b|\bexport\s*\{{[^}}]*\b{h.split(\".\")[-1]}\b', src)]
print(f'OK|{len(handlers)} handlers exportés par src/index.ts' if not miss else f'KO|Exports manquants: {miss}')
" 2>/dev/null || echo "KO|Erreur")"
  report "${r%%|*}" "handlers src/index.ts" "${r#*|}"
}

check_skill() {
  local r="$(python3 -c "
import yaml
parts = open('skills/work-brief/SKILL.md').read().split('---', 2)
fm = yaml.safe_load(parts[1]) if len(parts)>=3 else {}
name, desc = fm.get('name'), fm.get('description','')
print(f'OK|name: work-brief, description {len(desc)} car (>= 50)' if name=='work-brief' and len(desc)>=50 else 'KO|Frontmatter invalide')
" 2>/dev/null || echo "KO|Fichier absent ou invalide")"
  report "${r%%|*}" "Skill work-brief" "${r#*|}"
}

main() {
  printf "\n=== brief-forge — Contrôles pré-déploiement ===\n\n"
  check_node; check_forge_cli; check_foundry
  check_manifest; check_app_id
  check_actions; check_functions; check_handlers
  check_skill
  printf "\n"
  [[ ${FAILURES} -eq 0 ]] && { printf "Résultat : TOUS LES CONTRÔLES SONT VALIDES (0 échec)\n\n"; exit 0; }
  printf "Résultat : %d CONTRÔLE(S) EN ÉCHEC\n\n" "${FAILURES}"; exit 1
}

main "$@"
