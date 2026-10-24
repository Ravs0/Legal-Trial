"""The Python endpoint must share the Node routes' same-origin CORS behavior."""
import importlib.util
from email.message import Message
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("dreadler_api_cors", Path(__file__).resolve().parents[1] / "api/dreadler.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class CorsContract(unittest.TestCase):
    def check_origin(self, origin=None, host="legal-trial.vercel.app", configured="", forwarded=None):
        request = object.__new__(api.handler)
        request.headers = Message()
        if host:
            request.headers["Host"] = host
        if origin is not None:
            request.headers["Origin"] = origin
        if forwarded:
            request.headers["X-Forwarded-Host"] = forwarded
        sent = {}
        request.send_header = lambda name, value: sent.update({name: value})
        with patch.dict(api.os.environ, {"ALLOWED_ORIGINS": configured, "APP_ORIGIN": ""}):
            allowed = request._origin_allowed()
            request.send_cors_headers()
        self.assertNotIn("Access-Control-Allow-Credentials", sent)
        return allowed, sent

    def test_same_origin_without_allowlist(self):
        for host in ["legal-trial.vercel.app", "legal-trial-preview.vercel.app", "practice.example.com"]:
            with self.subTest(host=host):
                allowed, sent = self.check_origin("https://" + host, host=host)
                self.assertTrue(allowed)
                self.assertEqual(sent["Access-Control-Allow-Origin"], "https://" + host)

    def test_cross_origin_denied_without_reflection(self):
        for origin in ["https://attacker.example", "https://legal-trial.vercel.app.attacker.example", "http://legal-trial.vercel.app", "null"]:
            with self.subTest(origin=origin):
                allowed, sent = self.check_origin(origin, forwarded=origin.removeprefix("https://"))
                self.assertFalse(allowed)
                self.assertNotIn("Access-Control-Allow-Origin", sent)
        self.assertFalse(self.check_origin("https://attacker.example", host=None)[0])

    def test_configured_cross_origin(self):
        self.assertTrue(self.check_origin("https://app.example.com", configured="https://app.example.com")[0])

    def test_no_origin_remains_credentialless(self):
        allowed, sent = self.check_origin()
        self.assertTrue(allowed)
        self.assertNotIn("Access-Control-Allow-Origin", sent)


if __name__ == "__main__":
    unittest.main()
