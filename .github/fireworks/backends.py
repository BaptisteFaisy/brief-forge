#!/usr/bin/env python3
"""Backends d'appel modèle des agents de la file pr-auto-merge.

Deux chemins, une seule porte d'entrée : l'agent A2A local (ZeroClaw, via la
passerelle de la machine) ou l'API chat/completions Fireworks. Le compte
Fireworks étant suspendu, l'A2A prend la main dès qu'un jeton est lisible ;
Fireworks reste le repli quand la clé est là.

Le jeton n'est **jamais** écrit dans le dépôt : il est lu au runtime dans un
fichier (jamais affiché, jamais journalisé). Bibliothèque standard
uniquement.

Réglages (tous facultatifs) :

| Variable | Défaut | Effet |
|---|---|---|
| `CONFLICT_BACKEND` | `auto` | `a2a`, `openai` ou `auto` (forçage) |
| `CONFLICT_A2A_URL` | `http://127.0.0.1:42617/a2a/<agent>` | point d'entrée A2A |
| `CONFLICT_A2A_AGENT` | `b` | agent ZeroClaw appelé |
| `CONFLICT_A2A_TOKEN_FILE` | voir `JETON_FICHIERS` | fichier du jeton |
| `CONFLICT_A2A_TIMEOUT` | `90` | délai d'un appel A2A (secondes) |
"""

import json
import os
import urllib.request
import uuid

A2A_URL_BASE = "http://127.0.0.1:42617/a2a/"
AGENT_DEFAULT = "b"
# Jetons : le premier lisible gagne. Jamais de valeur en dur ici.
JETON_FICHIERS = ("~/.config/zeroclaw-serveur/token",
                  "/opt/zeroclaw/ephem/data/gateway-admin.token")
TIMEOUT_DEFAULT = 90
ROLE_UTILISATEUR = "ROLE_USER"
CONSIGNE = ("\n\nContraintes impératives : n'utilise AUCUN outil et ne lance "
            "AUCUNE commande. Rends uniquement le contenu demandé, dans un "
            "seul bloc (texte ou bloc de code), sans préambule ni "
            "explication.")


class AgentError(Exception):
    """Échec avec message publiable (sans secret)."""


def env_or(env, name, default):
    """Variable d'env ou défaut (une var absente arrive souvent comme "")."""
    return (env.get(name) or "").strip() or default


def lire_jeton(env):
    """Jeton A2A lu dans un fichier ; None s'il est introuvable ou vide."""
    fichiers = [env_or(env, "CONFLICT_A2A_TOKEN_FILE", "")] + list(JETON_FICHIERS)
    for chemin in fichiers:
        if not chemin:
            continue
        try:
            with open(os.path.expanduser(chemin), encoding="utf-8") as fh:
                jeton = fh.read().strip()
        except OSError:
            continue
        if jeton:
            return jeton
    return None


def url_a2a(env):
    """URL de la passerelle A2A pour l'agent demandé."""
    url = env_or(env, "CONFLICT_A2A_URL", "")
    if url:
        return url
    return A2A_URL_BASE + env_or(env, "CONFLICT_A2A_AGENT", AGENT_DEFAULT)


def timeout_a2a(env, defaut=TIMEOUT_DEFAULT):
    """Délai d'un appel A2A (secondes) ; le défaut si la valeur est fausse."""
    try:
        return float(env_or(env, "CONFLICT_A2A_TIMEOUT", str(defaut)))
    except ValueError:
        return float(defaut)


def resolve_backend(env=None):
    """Config du backend d'appel : `{"backend": "a2a"|"openai", ...}`.

    `auto` (défaut) : l'A2A si un jeton est lisible, sinon Fireworks si la
    clé est là, sinon erreur explicite. `CONFLICT_BACKEND` force l'un des
    deux ; une valeur inconnue est une erreur, jamais un repli silencieux.
    """
    env = os.environ if env is None else env
    choix = env_or(env, "CONFLICT_BACKEND", "auto").lower()
    if choix not in ("a2a", "openai", "auto"):
        raise AgentError("CONFLICT_BACKEND inconnu : %s (a2a|openai|auto)"
                         % choix)
    if choix in ("a2a", "auto"):
        jeton = lire_jeton(env)
        if jeton:
            return {"backend": "a2a", "url": url_a2a(env), "token": jeton,
                    "timeout": timeout_a2a(env)}
        if choix == "a2a":
            raise AgentError("jeton A2A illisible (CONFLICT_A2A_TOKEN_FILE)")
    if choix in ("openai", "auto"):
        cle = env_or(env, "FIREWORKS_API_KEY", "")
        if cle:
            return {"backend": "openai", "key": cle}
        if choix == "openai":
            raise AgentError("FIREWORKS_API_KEY absent")
    raise AgentError("aucun backend disponible : jeton A2A illisible et "
                     "FIREWORKS_API_KEY absent")


def etiquette(env=None):
    """Libellé lisible du backend actif, pour signer les comptes rendus.

    Ne lève jamais : un backend indisponible doit rester un commentaire
    honnête, pas une exception qui ferait rougir la CI.
    """
    try:
        cfg = resolve_backend(env)
    except AgentError:
        return "backend indisponible"
    if cfg.get("backend") == "a2a":
        agent = (cfg.get("url") or "").rstrip("/").rsplit("/", 1)[-1]
        return "ZeroClaw %s via A2A" % (agent or "agent")
    env = os.environ if env is None else env
    modele = env_or(env, "FIREWORKS_MODEL", "modele par defaut")
    return "Fireworks %s" % modele.rsplit("/", 1)[-1]


def signature(role, env=None):
    """Signe un compte rendu : `_fireworks · <rôle> (<backend réel>)_`."""
    return "_fireworks · %s (%s)_" % (role, etiquette(env))


def raison_absent(env=None):
    """Motif de l'absence de backend (chaîne vide s'il y en a un)."""
    try:
        resolve_backend(env)
    except AgentError as exc:
        return str(exc)
    return ""


def texte_prompt(messages):
    """system + user en un seul texte (l'A2A ne prend qu'un message)."""
    morceaux = []
    for message in messages or []:
        contenu = (message or {}).get("content") or ""
        if contenu:
            morceaux.append(contenu)
    return "\n\n".join(morceaux) + CONSIGNE


def extraire_texte(data):
    """Texte des artifacts de la tâche (`result.task.artifacts[].parts[].text`)."""
    try:
        task = data["result"]["task"]
        etat = (task.get("status") or {}).get("state")
        textes = []
        for artifact in task.get("artifacts") or []:
            for part in artifact.get("parts") or []:
                texte = part.get("text")
                if texte:
                    textes.append(texte)
    except (KeyError, TypeError, AttributeError):
        raise AgentError("réponse A2A illisible (pas de result.task.artifacts)")
    if etat and etat != "TASK_STATE_COMPLETED":
        raise AgentError("tâche A2A non terminée (état %s)" % etat)
    if not textes:
        raise AgentError("réponse A2A sans texte (artifacts vides)")
    return "\n".join(textes)


def a2a_complete(url, token, messages, timeout=TIMEOUT_DEFAULT):
    """Appel de l'agent A2A (SendMessage) ; rend le texte de la réponse.

    L'agent distant est agentique : le prompt porte la consigne « aucun
    outil ». Une erreur JSON-RPC est levée telle quelle (jamais avalée).
    """
    ident = uuid.uuid4().hex
    charge = {"jsonrpc": "2.0", "id": ident, "method": "SendMessage",
              "params": {"message": {"role": ROLE_UTILISATEUR,
                                     "parts": [{"type": "text",
                                                "text": texte_prompt(messages)}],
                                     "messageId": ident}}}
    req = urllib.request.Request(url, data=json.dumps(charge).encode("utf-8"),
                                 method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    # Casse exacte : `add_header()` normaliserait en `A2a-version`.
    req.headers["A2A-Version"] = "1.0"
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:                                   # noqa: BLE001
        raise AgentError("appel A2A : %s" % str(exc)[:200])
    if isinstance(data, dict) and data.get("error"):
        erreur = data["error"]
        raise AgentError("erreur A2A %s : %s"
                         % (erreur.get("code"), str(erreur.get("message"))[:200]))
    return extraire_texte(data)


def openai_complete(api_url, key, model, messages, temperature, max_tokens,
                    timeout=TIMEOUT_DEFAULT):
    """Un appel chat/completions (Fireworks), rend le texte réponse."""
    payload = json.dumps({"model": model, "messages": messages,
                          "temperature": temperature,
                          "max_tokens": max_tokens}).encode("utf-8")
    req = urllib.request.Request(api_url, data=payload, method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:                                   # noqa: BLE001
        raise AgentError("appel Fireworks : %s" % str(exc)[:200])
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AgentError("réponse Fireworks illisible (pas de choices[0])")


def complete(messages, api_url="", key="", model="", temperature=0.2,
             max_tokens=8_000, timeout=TIMEOUT_DEFAULT, env=None):
    """Appel modèle unique : A2A si joignable, Fireworks sinon.

    `api_url`/`key`/`model` servent au chemin Fireworks (le chemin A2A les
    ignore : l'agent distant est déjà configuré).
    """
    config = resolve_backend(env)
    if config["backend"] == "a2a":
        return a2a_complete(config["url"], config["token"], messages,
                            config.get("timeout") or timeout)
    return openai_complete(api_url, key or config.get("key", ""), model,
                           messages, temperature, max_tokens, timeout)
