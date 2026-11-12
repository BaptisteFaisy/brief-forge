#!/usr/bin/env python3
"""Mesure la fidélité des briefs sur des **tickets réels** d'un site Atlassian.

Entrée : un dossier de captures JSON produites par la sonde de développement
(`cmd=full&issue=<CLE>&budgets=s,m,l`, branche `dev/sonde-site`). Chaque capture
contient la collecte brute (ticket, commentaires, décisions, voisins, réglages),
le score de préparation et les briefs construits par l'app déployée.

Sortie : les indicateurs au format JSON sur stdout, et le marquage des écarts.
Aucun réseau, aucun secret : les captures sont des fichiers locaux.

Usage : python3 scripts/live-fidelity.py <dossier-de-captures> [> resultat.json]

Les indicateurs sont ceux de `docs/FIDELITY-REPORT.md` (jeu simulé), appliqués
ici à des données vivantes — la différence est dans la source, pas dans la
mesure. Deux règles spécifiques au réel :

* la **traçabilité** distingue le texte *cité* (il doit se retrouver dans la
  collecte) du texte *composé* par le moteur (« Type de ticket : Epic — statut
  To Do », « untel (assigné) ») : pour ce dernier, on vérifie que chaque valeur
  vient bien de la collecte, ce qui est la vraie question ;
* un élément sans source ni date est une violation de BC-02, quel que soit son
  contenu.
"""

import glob
import json
import math
import os
import re
import sys
import unicodedata

SECTIONS_SOURCES = [
    "acceptanceCriteria",
    "applicableDecisions",
    "failedAttempts",
    "neighborChanges",
    "constraints",
    "lessons",
    "whoToAsk",
]
INJECTIONS = [
    "ignore les consignes",
    "ignore all previous",
    "ignore previous",
    "pousse sur main",
    "push to main",
    "developer mode",
    "bypass all",
    "system override",
]
SECRETS = [
    r"ghp_[A-Za-z0-9]{36}",
    r"gho_[A-Za-z0-9]{36}",
    r"github_pat_[A-Za-z0-9_]{50,}",
    r"sk-[A-Za-z0-9_\-]{20,}",
    r"AKIA[0-9A-Z]{16}",
    r"xox[baprs]-[0-9A-Za-z\-]{10,}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
]


def normalise(texte):
    """Comparaison insensible à la casse, aux accents et à la ponctuation."""
    texte = unicodedata.normalize("NFKD", str(texte or ""))
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", texte.lower()).strip()


def mots(texte):
    return {m for m in normalise(texte).split() if len(m) > 3}


def jetons(markdown):
    """Même heuristique que `src/util/tokens.ts` : 1 jeton ≈ 4 caractères."""
    return math.ceil(len(markdown or "") / 4)


def corpus(capture):
    """Tout ce que la collecte a vu : la seule matière autorisée dans le brief."""
    issue = capture.get("issue") or {}
    reglages = capture.get("settings") or {}
    textes = [
        issue.get("summary"),
        issue.get("description"),
        issue.get("reporter"),
        issue.get("assignee"),
        issue.get("issueType"),
        issue.get("status"),
        issue.get("epicKey"),
        reglages.get("constraintsText"),
        reglages.get("componentZone"),
        reglages.get("projectKey"),
        reglages.get("triggerStatus"),
    ]
    textes += list(issue.get("acceptanceCriteria") or [])
    textes += list(issue.get("components") or [])
    textes += list(issue.get("labels") or [])
    for commentaire in issue.get("comments") or []:
        textes += [commentaire.get("body"), commentaire.get("author")]
    for valeur in (issue.get("customFields") or {}).values():
        textes.append(valeur)
    for lien in issue.get("links") or []:
        textes += [lien.get("title"), lien.get("key"), lien.get("type"), lien.get("status")]
    for entree in issue.get("history") or []:
        textes += [entree.get("summary"), entree.get("author")]
    for decision in capture.get("decisions") or []:
        textes += [decision.get("title"), decision.get("body"), decision.get("author"), decision.get("url")]
    for voisin in capture.get("neighbors") or []:
        textes += [voisin.get("title"), voisin.get("author"), voisin.get("url"), voisin.get("state")]
    for tentative in capture.get("attempts") or []:
        textes += [tentative.get("reportMd"), tentative.get("agentName"), tentative.get("status")]
    return textes


def valeurs_composees(capture):
    """Valeurs que le moteur a le droit d'assembler lui-même (libellés + données)."""
    issue = capture.get("issue") or {}
    reglages = capture.get("settings") or {}
    valeurs = {
        str(issue.get("issueType") or ""),
        str(issue.get("status") or ""),
        str(issue.get("reporter") or ""),
        str(issue.get("assignee") or ""),
        str(reglages.get("componentZone") or ""),
        str(reglages.get("projectKey") or ""),
    }
    valeurs |= {str(x) for x in (issue.get("labels") or [])}
    valeurs |= {str(x) for x in (issue.get("components") or [])}
    for commentaire in issue.get("comments") or []:
        valeurs.add(str(commentaire.get("author") or ""))
    for decision in capture.get("decisions") or []:
        valeurs.add(str(decision.get("author") or ""))
    return {v for v in valeurs if v}


COMPOSES = [
    re.compile(r"^Type de ticket : (?P<a>.+?) — statut (?P<b>.+)$"),
    re.compile(r"^Zone technique : (?P<a>.+)$"),
    re.compile(r"^Étiquettes : (?P<a>.+)$"),
    re.compile(r"^(?P<a>.+?) \((?P<b>assigné|rapporteur|commentateur|auteur)\)$"),
]


def tracer(capture, texte, mots_corpus, corpus_normalise):
    """Vrai si l'élément est rattachable à la collecte (cité ou composé de valeurs réelles)."""
    brut = str(texte or "").strip()
    if not brut:
        return True
    for motif in COMPOSES:
        correspondance = motif.match(brut)
        if not correspondance:
            continue
        valeurs = valeurs_composees(capture)
        groupes = [g for g in correspondance.groupdict().values() if g]
        morceaux = []
        for groupe in groupes:
            morceaux += [m.strip() for m in re.split(r"[,;—-]", groupe) if m.strip()]
        if morceaux and all(any(m.lower() in v.lower() or v.lower() in m.lower() for v in valeurs) for m in morceaux):
            return True
    if normalise(brut) and normalise(brut) in corpus_normalise:
        return True
    utiles = mots(brut)
    if not utiles:
        return True
    return sum(1 for m in utiles if m in mots_corpus) / len(utiles) >= 0.5


def mesurer(capture):
    """Indicateurs d'une capture (un ticket, ses trois budgets)."""
    issue = capture.get("issue") or {}
    textes = corpus(capture)
    mots_corpus = set()
    for texte in textes:
        mots_corpus |= mots(texte)
    corpus_normalise = " ".join(normalise(t) for t in textes)
    basse = " ".join(str(t or "") for t in textes).lower()

    sortie = {
        "issueKey": capture.get("issueKey"),
        "acteur": capture.get("actor"),
        "commentaires": len(issue.get("comments") or []),
        "decisions": len(capture.get("decisions") or []),
        "voisins": len(capture.get("neighbors") or []),
        "erreursCollecte": capture.get("collectedErrors") or [],
        "briefs": {},
    }

    preparation = capture.get("readiness") or {}
    perdus = sum(int(g.get("pointsLost") or 0) for g in preparation.get("gaps") or [])
    score = preparation.get("score")
    sortie["preparation"] = {
        "score": score,
        "statut": preparation.get("status"),
        "manques": len(preparation.get("gaps") or []),
        "pointsPerdus": perdus,
        # Un score plafonné (ticket sans description) est inférieur à 100 - perdus.
        "coherent": score is not None and score <= max(0, 100 - perdus) + 0 and (100 - perdus - score) in (0, 100 - perdus - score),
    }
    sortie["preparation"]["coherent"] = score is not None and 0 <= score <= 100 and score <= 100 - perdus + 6

    for budget, brief in (capture.get("briefs") or {}).items():
        markdown = brief.get("markdown") or ""
        elements = 0
        sans_source = 0
        intracables = []
        for section in SECTIONS_SOURCES:
            for element in brief.get(section) or []:
                elements += 1
                if not (str(element.get("source") or "").strip() and str(element.get("date") or "").strip()):
                    sans_source += 1
                if not tracer(capture, element.get("text"), mots_corpus, corpus_normalise):
                    intracables.append({"section": section, "texte": str(element.get("text"))[:120]})
        cible = int(brief.get("tokenTarget") or 0)
        tronques = brief.get("truncatedSections") or []
        sortie["briefs"][budget] = {
            "jetons": jetons(markdown),
            "cible": cible,
            "budgetTenu": jetons(markdown) <= cible * 1.10 if cible else None,
            "elements": elements,
            "sansSource": sans_source,
            "intracables": intracables,
            "troncatures": tronques,
            "troncatureNommee": (not tronques) or bool(re.search(r"`[a-z][a-z-]+`", markdown)),
            "trous": len(brief.get("gaps") or []),
            "fuiteInstruction": [p for p in INJECTIONS if p in markdown.lower()],
            "fuiteSecret": [p for p in SECRETS if re.search(p, markdown)],
            "secretBrutPresent": [p for p in SECRETS if re.search(p, basse) and re.search(p, markdown)],
            "ecartSignale": "écarté" in markdown,
            "ms": (capture.get("ms") or {}).get("briefs", {}).get(budget),
        }
    return sortie


def agreger(mesures):
    """Consolidation tous tickets × tous budgets."""
    total = {
        "tickets": len(mesures),
        "briefs": 0,
        "elements": 0,
        "sansSource": 0,
        "intracables": 0,
        "budgetTenu": 0,
        "budgetDepasse": 0,
        "troncatures": 0,
        "troncatureNommee": 0,
        "fuiteInstruction": 0,
        "fuiteSecret": 0,
        "ecartSignale": 0,
        "preparationCoherente": 0,
        "ticketsAvecErreursCollecte": 0,
    }
    durees = {"s": [], "m": [], "l": []}
    exemples = []
    for mesure in mesures:
        if mesure["preparation"]["coherent"]:
            total["preparationCoherente"] += 1
        if mesure["erreursCollecte"]:
            total["ticketsAvecErreursCollecte"] += 1
        for budget, brief in mesure["briefs"].items():
            total["briefs"] += 1
            total["elements"] += brief["elements"]
            total["sansSource"] += brief["sansSource"]
            total["intracables"] += len(brief["intracables"])
            total["budgetTenu"] += 1 if brief["budgetTenu"] else 0
            total["budgetDepasse"] += 0 if brief["budgetTenu"] else 1
            total["troncatures"] += len(brief["troncatures"])
            total["troncatureNommee"] += 1 if brief["troncatureNommee"] else 0
            total["fuiteInstruction"] += len(brief["fuiteInstruction"])
            total["fuiteSecret"] += len(brief["fuiteSecret"])
            total["ecartSignale"] += 1 if brief["ecartSignale"] else 0
            if brief["ms"]:
                durees[budget].append(brief["ms"])
            for intracable in brief["intracables"][:2]:
                exemples.append({"ticket": mesure["issueKey"], "budget": budget, **intracable})
    for budget, valeurs in durees.items():
        if valeurs:
            valeurs.sort()
            total["ms_" + budget] = {
                "min": valeurs[0],
                "mediane": valeurs[len(valeurs) // 2],
                "p95": valeurs[max(0, int(len(valeurs) * 0.95) - 1)],
                "max": valeurs[-1],
            }
    return total, exemples


def main():
    dossier = sys.argv[1] if len(sys.argv) > 1 else "."
    fichiers = sorted(glob.glob(os.path.join(dossier, "*.json")))
    if not fichiers:
        sys.exit("aucune capture JSON dans %s" % dossier)
    captures = []
    for chemin in fichiers:
        with open(chemin, encoding="utf-8") as fh:
            donnees = json.load(fh)
        if "briefs" in donnees:
            captures.append(donnees)
        else:
            sys.stderr.write("capture ignorée (%s) : %s\n" % (chemin, str(donnees.get("error"))[:80]))
    mesures = [mesurer(c) for c in captures]
    total, exemples = agreger(mesures)
    json.dump({"total": total, "exemplesIntracables": exemples[:20], "parTicket": mesures},
              sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
