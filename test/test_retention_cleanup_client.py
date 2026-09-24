import contextlib
import importlib.util
import io
import json
import os
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("retention_cleanup", ROOT / "scripts" / "retention_cleanup.py")
client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client)

TOKEN = "unit-test-bearer-token"
RAW_BODY = "raw-body-must-not-be-printed"


class FakeResponse:
    def __init__(self, status, body):
        self.status = status
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def getcode(self):
        return self.status

    def read(self, size=-1):
        if size < 0:
            return self.body
        return self.body[:size]


class RetentionCleanupClientTest(unittest.TestCase):
    def run_client(self, argv):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {client.TOKEN_ENV: TOKEN}, clear=False):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                result = client.main(argv)
        return result, stdout.getvalue(), stderr.getvalue()

    def test_posts_https_bearer_request_and_prints_only_status_and_counts(self):
        response_body = json.dumps({
            "batches": 2,
            "candidates": 7,
            "recommendationsDeleted": 3,
            "outboxDeleted": 1,
            "devicesDeleted": 2,
            "debug": RAW_BODY,
        }).encode()
        calls = []

        def fake_urlopen(request, timeout):
            calls.append((request, timeout))
            return FakeResponse(200, response_body)

        with mock.patch.object(client.urllib.request, "urlopen", fake_urlopen):
            result, stdout, stderr = self.run_client(["https://worker.example"])

        self.assertEqual(result, 0)
        self.assertEqual(stderr, "")
        self.assertEqual(
            stdout,
            "retention cleanup: status=200 batches=2 candidates=7 "
            "recommendationsDeleted=3 outboxDeleted=1 devicesDeleted=2\n",
        )
        self.assertEqual(len(calls), 1)
        request, timeout = calls[0]
        self.assertEqual(request.full_url, "https://worker.example/api/maintenance/retention-cleanup")
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.data, b"")
        self.assertEqual(request.get_header("Authorization"), f"Bearer {TOKEN}")
        self.assertEqual(request.get_header("User-agent"), "beanfit-retention/0.4.2")
        self.assertEqual(timeout, client.REQUEST_TIMEOUT_SECONDS)
        self.assertNotIn(TOKEN, stdout)
        self.assertNotIn(RAW_BODY, stdout)

    def test_rejects_non_https_before_reading_token_or_calling_network(self):
        with mock.patch.object(client.urllib.request, "urlopen") as urlopen:
            result, stdout, stderr = self.run_client(["http://worker.example"])

        self.assertEqual(result, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "retention cleanup: an explicit HTTPS base URL is required\n")
        urlopen.assert_not_called()

    def test_rejects_missing_environment_token_before_calling_network(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch.object(client.urllib.request, "urlopen") as urlopen:
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    result = client.main(["https://worker.example"])

        self.assertEqual(result, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "retention cleanup: RETENTION_CLEANUP_TOKEN is required\n")
        urlopen.assert_not_called()

    def test_rejects_a_token_supplied_as_a_cli_argument_without_echoing_it(self):
        with mock.patch.object(client.urllib.request, "urlopen") as urlopen:
            result, stdout, stderr = self.run_client(["https://worker.example", TOKEN])

        self.assertEqual(result, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "usage: retention_cleanup.py HTTPS_BASE_URL\n")
        self.assertNotIn(TOKEN, stderr)
        urlopen.assert_not_called()

    def test_non_2xx_reports_only_sanitized_status(self):
        error = urllib.error.HTTPError(
            "https://worker.example/api/maintenance/retention-cleanup",
            503,
            RAW_BODY,
            None,
            io.BytesIO(RAW_BODY.encode()),
        )
        self.addCleanup(error.close)
        with mock.patch.object(client.urllib.request, "urlopen", side_effect=error):
            result, stdout, stderr = self.run_client(["https://worker.example"])

        self.assertEqual(result, 1)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "retention cleanup: status=503\n")
        self.assertNotIn(TOKEN, stdout + stderr)
        self.assertNotIn(RAW_BODY, stdout + stderr)

    def test_timeout_reports_a_fixed_error_without_exception_details(self):
        with mock.patch.object(client.urllib.request, "urlopen", side_effect=TimeoutError(RAW_BODY)):
            result, stdout, stderr = self.run_client(["https://worker.example"])

        self.assertEqual(result, 1)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "retention cleanup: request failed\n")
        self.assertNotIn(RAW_BODY, stdout + stderr)

    def test_malformed_success_body_is_rejected_without_being_printed(self):
        with mock.patch.object(
            client.urllib.request,
            "urlopen",
            return_value=FakeResponse(200, RAW_BODY.encode()),
        ):
            result, stdout, stderr = self.run_client(["https://worker.example"])

        self.assertEqual(result, 1)
        self.assertEqual(stdout, "")
        self.assertEqual(stderr, "retention cleanup: invalid response\n")
        self.assertNotIn(RAW_BODY, stdout + stderr)


if __name__ == "__main__":
    unittest.main()
