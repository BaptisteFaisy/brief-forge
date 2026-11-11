#!/usr/bin/env python3
"""Tests unitaires de backends.py — bibliothèque standard uniquement.

Aucun réseau : double de urllib.request.urlopen.
Lance : python3 .github/fireworks/test_backends.py
"""

import json
import os
import tempfile
import unittest
import urllib.error
from unittest import mock

import backends


class FauxResponse:
    """Double minimal d'une réponse urllib (contexte `with`)."""

    def __init__(self, data_dict):
        self.raw = json.dumps(data_dict).encode("utf-8")

    def read(self):
        return self.raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class ResolveBackendTest(unittest.TestCase):
    """Choix automatique et forçages de backends."""

    def test_auto_avec_jeton_choisit_a2a(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as tf:
            tf.write("mon-jeton-secret\n")
            token_file = tf.name
        self.addCleanup(lambda: os.unlink(token_file) if os.path.exists(token_file) else None)
        env = {"CONFLICT_BACKEND": "auto",
               "CONFLICT_A2A_TOKEN_FILE": token_file,
               "FIREWORKS_API_KEY": "cle-fw"}
        cfg = backends.resolve_backend(env)
        self.assertEqual(cfg["backend"], "a2a")
        self.assertEqual(cfg["token"], "mon-jeton-secret")
        self.assertIn("127.0.0.1:42617/a2a/b", cfg["url"])

    def test_auto_sans_jeton_bascule_sur_openai(self):
        env = {"CONFLICT_BACKEND": "auto",
               "CONFLICT_A2A_TOKEN_FILE": "/fichier/qui/n/existe/pas/123",
               "FIREWORKS_API_KEY": "cle-fw-test"}
        with mock.patch.object(backends, "JETON_FICHIERS", ()):
            cfg = backends.resolve_backend(env)
        self.assertEqual(cfg["backend"], "openai")
        self.assertEqual(cfg["key"], "cle-fw-test")

    def test_aucun_backend_leve_agent_error(self):
        env = {"CONFLICT_BACKEND": "auto",
               "CONFLICT_A2A_TOKEN_FILE": "/fichier/inexistant",
               "FIREWORKS_API_KEY": ""}
        with mock.patch.object(backends, "JETON_FICHIERS", ()):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.resolve_backend(env)
        self.assertIn("aucun backend", str(ctx.exception))

    def test_forcage_openai_ignore_jeton_a2a(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as tf:
            tf.write("jeton-present\n")
            token_file = tf.name
        self.addCleanup(lambda: os.unlink(token_file) if os.path.exists(token_file) else None)
        env = {"CONFLICT_BACKEND": "openai",
               "CONFLICT_A2A_TOKEN_FILE": token_file,
               "FIREWORKS_API_KEY": "cle-forcee"}
        cfg = backends.resolve_backend(env)
        self.assertEqual(cfg["backend"], "openai")
        self.assertEqual(cfg["key"], "cle-forcee")

    def test_forcage_a2a_sans_jeton_leve_erreur(self):
        env = {"CONFLICT_BACKEND": "a2a",
               "CONFLICT_A2A_TOKEN_FILE": "/inexistant",
               "FIREWORKS_API_KEY": "cle-presente"}
        with mock.patch.object(backends, "JETON_FICHIERS", ()):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.resolve_backend(env)
        self.assertIn("jeton A2A illisible", str(ctx.exception))

    def test_valeur_inconnue_leve_erreur(self):
        env = {"CONFLICT_BACKEND": "inconnu"}
        with self.assertRaises(backends.AgentError) as ctx:
            backends.resolve_backend(env)
        self.assertIn("inconnu", str(ctx.exception))

    def test_url_et_agent_personnalises(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as tf:
            tf.write("jeton\n")
            token_file = tf.name
        self.addCleanup(lambda: os.unlink(token_file) if os.path.exists(token_file) else None)
        env = {"CONFLICT_A2A_TOKEN_FILE": token_file,
               "CONFLICT_A2A_AGENT": "mon-agent",
               "CONFLICT_A2A_TIMEOUT": "45"}
        cfg = backends.resolve_backend(env)
        self.assertEqual(cfg["url"], "http://127.0.0.1:42617/a2a/mon-agent")
        self.assertEqual(cfg["timeout"], 45.0)


class A2ACompleteTest(unittest.TestCase):
    """Protocole A2A : requête JSON-RPC, rôle, extraction, erreurs."""

    def test_role_user_et_en_tetes_envoyes(self):
        appels = []

        def faux_urlopen(req, timeout=None):
            appels.append((req, timeout))
            corps = json.loads(req.data.decode("utf-8"))
            reponse = {
                "jsonrpc": "2.0",
                "id": corps["id"],
                "result": {
                    "task": {
                        "id": "t1",
                        "status": {"state": "TASK_STATE_COMPLETED"},
                        "artifacts": [
                            {"parts": [{"type": "text", "text": "OK RESOLU"}]}
                        ]
                    }
                }
            }
            return FauxResponse(reponse)

        messages = [{"role": "system", "content": "Consigne systeme"},
                    {"role": "user", "content": "Corps utilisateur"}]
        with mock.patch.object(backends.urllib.request, "urlopen", faux_urlopen):
            texte = backends.a2a_complete("http://127.0.0.1:42617/a2a/b",
                                          "jeton-secret", messages, timeout=42)

        self.assertEqual(texte, "OK RESOLU")
        self.assertEqual(len(appels), 1)
        req, to = appels[0]
        self.assertEqual(to, 42)
        self.assertEqual(req.get_header("Authorization"), "Bearer jeton-secret")
        self.assertEqual(req.get_header("A2A-Version"), "1.0")
        self.assertEqual(req.get_header("Content-type"), "application/json")

        charge = json.loads(req.data.decode("utf-8"))
        self.assertEqual(charge["method"], "SendMessage")
        message = charge["params"]["message"]
        self.assertEqual(message["role"], "ROLE_USER")
        part_text = message["parts"][0]["text"]
        self.assertIn("Consigne systeme", part_text)
        self.assertIn("Corps utilisateur", part_text)
        self.assertIn("AUCUN outil", part_text)

    def test_extraction_multi_parts(self):
        reponse = {
            "result": {
                "task": {
                    "status": {"state": "TASK_STATE_COMPLETED"},
                    "artifacts": [
                        {"parts": [{"text": "ligne 1\n"}, {"text": "ligne 2"}]}
                    ]
                }
            }
        }
        with mock.patch.object(backends.urllib.request, "urlopen",
                               return_value=FauxResponse(reponse)):
            texte = backends.a2a_complete("http://x", "tok", [])
        self.assertEqual(texte, "ligne 1\n\nligne 2")

    def test_erreur_jsonrpc_leve_agent_error(self):
        reponse = {
            "jsonrpc": "2.0",
            "id": "1",
            "error": {"code": -32602, "message": "role invalide"}
        }
        with mock.patch.object(backends.urllib.request, "urlopen",
                               return_value=FauxResponse(reponse)):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.a2a_complete("http://x", "tok", [])
        self.assertIn("-32602", str(ctx.exception))
        self.assertIn("role invalide", str(ctx.exception))

    def test_erreur_http_leve_agent_error(self):
        with mock.patch.object(backends.urllib.request, "urlopen",
                               side_effect=urllib.error.URLError("connexion refusée")):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.a2a_complete("http://x", "tok", [])
        self.assertIn("connexion refusée", str(ctx.exception))

    def test_reponse_invalide_ou_etat_non_termine(self):
        reponse = {
            "result": {
                "task": {
                    "status": {"state": "TASK_STATE_FAILED"},
                    "artifacts": []
                }
            }
        }
        with mock.patch.object(backends.urllib.request, "urlopen",
                               return_value=FauxResponse(reponse)):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.a2a_complete("http://x", "tok", [])
        self.assertIn("TASK_STATE_FAILED", str(ctx.exception))


class OpenAICompleteTest(unittest.TestCase):
    """Backend chat/completions Fireworks."""

    def test_appel_chat_completions_nominal(self):
        reponse = {
            "choices": [{"message": {"content": "```\ncode\n```"}}]
        }
        with mock.patch.object(backends.urllib.request, "urlopen",
                               return_value=FauxResponse(reponse)):
            res = backends.openai_complete("https://api.fireworks.ai/v1",
                                           "key-123", "mon-modele",
                                           [{"role": "user", "content": "hi"}],
                                           0.2, 500, timeout=15)
        self.assertEqual(res, "```\ncode\n```")

    def test_reponse_illisible_leve_agent_error(self):
        with mock.patch.object(backends.urllib.request, "urlopen",
                               return_value=FauxResponse({"choices": []})):
            with self.assertRaises(backends.AgentError) as ctx:
                backends.openai_complete("https://api.fireworks.ai/v1", "k", "m",
                                        [], 0.1, 100)
        self.assertIn("illisible", str(ctx.exception))


class CompleteDispatchTest(unittest.TestCase):
    """Fonction d'aiguillage de haut niveau `complete()`."""

    def test_complete_aiguille_vers_a2a_quand_disponible(self):
        env = {"CONFLICT_BACKEND": "a2a"}
        with mock.patch.object(backends, "resolve_backend",
                               return_value={"backend": "a2a", "url": "http://a2a",
                                             "token": "tok", "timeout": 33}), \
                mock.patch.object(backends, "a2a_complete",
                                  return_value="RETOURA2A") as mock_a2a:
            res = backends.complete([{"role": "user", "content": "p"}], env=env)
        self.assertEqual(res, "RETOURA2A")
        mock_a2a.assert_called_once_with("http://a2a", "tok",
                                         [{"role": "user", "content": "p"}], 33)

    def test_complete_aiguille_vers_openai_sur_repli(self):
        env = {"CONFLICT_BACKEND": "openai"}
        with mock.patch.object(backends, "resolve_backend",
                               return_value={"backend": "openai", "key": "cle"}), \
                mock.patch.object(backends, "openai_complete",
                                  return_value="RETOUROPENAI") as mock_oai:
            res = backends.complete([{"role": "user", "content": "p"}],
                                    api_url="http://fw", model="mod", env=env)
        self.assertEqual(res, "RETOUROPENAI")
        mock_oai.assert_called_once_with("http://fw", "cle", "mod",
                                         [{"role": "user", "content": "p"}],
                                         0.2, 8000, 90)


if __name__ == "__main__":
    unittest.main()
