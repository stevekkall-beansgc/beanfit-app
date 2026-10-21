"""Pinned CLI -> disposable Wrangler/D1 content test; no real hardware or models.

Expected JSON is authored independently of build_pair_payload, evaluate,
sanitizeRanked and generateStack. We deliberately replace ONLY hardware detect
in a temporary sitecustomize; the source manifest is checked before any import.
Run via test/e2e-content.sh and the owning e2e-local.sh wrapper.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "test/fixtures"
EXPECTED = json.loads((FIXTURES / "cli-content-expected.json").read_text())
CALLER = json.loads((FIXTURES / "cli-content-caller.json").read_text())


def require_equal(actual, expected, label):
    # Never dump credentials, cookies, raw database rows or CLI output on failure.
    assert actual == expected, f"{label}: exact content differs"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def client():
    # This client is restricted to loopback HTTP by main(); mirror curl's
    # localhost cookie behavior without weakening the application's cookies.
    jar = http.cookiejar.CookieJar(http.cookiejar.DefaultCookiePolicy(
        secure_protocols=("https", "http")))
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect(),
        urllib.request.HTTPCookieProcessor(jar))


def main():
    base, persist = sys.argv[1:]
    target = urllib.parse.urlsplit(base)
    assert target.scheme == "http" and target.hostname == "127.0.0.1"
    assert target.port and not target.username and target.path == ""
    persist = Path(persist).resolve(strict=True)
    assert persist.name == "persist", "requires wrapper's disposable persistence directory"
    source = Path(os.environ["BEANFIT_SRC"]).resolve(strict=True)
    for entry in CALLER["files"]:
        path = Path(entry["path"])
        assert path.parts[0] == "src" and ".." not in path.parts
        actual = hashlib.sha256((source / Path(*path.parts[1:])).read_bytes()).hexdigest()
        require_equal(actual, entry["sha256"], f"caller pin {path}")
    print(f"Content E2E caller pin verified: {CALLER['commit']} ({len(CALLER['files'])} files)")
    wrangler = str(Path(os.environ.get("WRANGLER_BIN", "node_modules/.bin/wrangler")).resolve(strict=True))

    def read_saved(device_id):
        assert re.fullmatch(r"[a-f0-9]{32}", device_id)
        # Explicit projection excludes session/device/claim credentials, even hashed.
        fields = ",".join("d." + field for field in EXPECTED["hardware"])
        sql = (f"SELECT {fields},d.status,d.label,d.stack_json,r.use_case,r.engine_version,r.payload_json "
               "FROM devices d JOIN recommendations r ON r.device_id=d.id "
               f"WHERE d.id='{device_id}'")
        out = subprocess.run([wrangler, "d1", "execute", "beanfit-app", "--local",
                              "--persist-to", str(persist), "--command", sql, "--json"],
                             check=True, text=True, capture_output=True, timeout=30)
        rows = json.loads(out.stdout)
        assert len(rows) == 1 and rows[0]["success"]
        assert len(rows[0]["results"]) == 1, "exactly one saved recommendation required"
        return rows[0]["results"][0]

    owner, other, anonymous = client(), client(), client()

    def request(agent, path, status=200, form=None, data=None):
        assert path.startswith("/") and not path.startswith("//")
        headers = {}
        body = None
        if form is not None:
            body = urllib.parse.urlencode(form).encode()
            headers["content-type"] = "application/x-www-form-urlencoded"
        if data is not None:
            body = json.dumps(data).encode()
            headers["content-type"] = "application/json"
        req = urllib.request.Request(base + path, data=body, headers=headers)
        try:
            response = agent.open(req, timeout=10)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            require_equal(response.status, status, path + " status")
            return response.read().decode()

    for agent, prefix in [(owner, "owner"), (other, "other")]:
        request(agent, "/signup", 303, form={
            "email": f"content-{prefix}-{time.time_ns()}@synthetic.invalid",
            "password": "synthetic-content-test-password"})

    with tempfile.TemporaryDirectory(prefix="beanfit-content-") as temp:
        work = Path(temp)
        adapter = work / "adapter"
        adapter.mkdir()
        # A hardware adapter, NOT a payload/engine stub. Prevent accidental physical
        # probes/subprocesses and non-loopback network access inside the real CLI.
        (adapter / "sitecustomize.py").write_text(
            "import sys\n"
            "def guard(event, args):\n"
            "    if event in ('subprocess.Popen', 'os.system'):\n"
            "        raise RuntimeError('physical/subprocess operation forbidden')\n"
            "    if event == 'import' and args[0] == 'beanfit.hw.macos':\n"
            "        raise RuntimeError('physical detector import forbidden')\n"
            "    if event == 'socket.connect':\n"
            f"        assert args[1] == ('127.0.0.1', {target.port}), 'non-loopback socket forbidden'\n"
            "sys.addaudithook(guard)\n"
            "import beanfit.hw\n"
            f"def synthetic_detect():\n    return {EXPECTED['hardware'] | {'unlisted': 'DROP-SYNTHETIC-PROFILE-FIELD'}!r}\n"
            "beanfit.hw.detect = synthetic_detect\n")
        env = dict(os.environ, HOME=str(work / "home"), APPDATA=str(work / "appdata"),
                   PYTHONPATH=os.pathsep.join([str(adapter), str(source)]),
                   PYTHONNOUSERSITE="1", PYTHONDONTWRITEBYTECODE="1")
        # Python prints sitecustomize failures and may continue startup: require
        # the exact adapter identity in both the guard and the actual CLI process.
        guard = ("import sys,beanfit.hw; from beanfit import register; "
                 "assert register.detect is beanfit.hw.detect; "
                 "assert register.detect.__module__=='sitecustomize'; "
                 "assert 'beanfit.hw.macos' not in sys.modules; ")
        subprocess.run([sys.executable, "-B", "-c", guard], env=env, check=True,
                       capture_output=True, timeout=10)
        cli = (guard + "from beanfit.cli import main; sys.exit(main())")
        log_path = work / "cli.log"
        process = None
        try:
            with log_path.open("w") as log:
                process = subprocess.Popen(
                    [sys.executable, "-B", "-c", cli, "register", "--server", base,
                     "--use-case", "coding", "--label", "Synthetic <CLI> & snapshot", "--poll-secs", "1"],
                    env=env, stdout=log, stderr=subprocess.STDOUT)
                deadline = time.monotonic() + 15
                code = None
                while time.monotonic() < deadline:
                    match = re.search(r"Pairing code: ([0-9A-Z]{8})", log_path.read_text())
                    if match:
                        code = match[1]
                        break
                    assert process.poll() is None, "CLI exited before pairing code"
                    time.sleep(0.1)
                assert code, "CLI pairing code timeout"
                confirmation = request(owner, f"/pair/{code}")
                assert "Synthetic &lt;CLI&gt; &amp; chip" in confirmation
                assert "Synthetic <CLI>" not in confirmation
                # Pending ID is available via the same local D1 state, without
                # reading token columns or the caller's credentials.
                query = f"SELECT id FROM devices WHERE pair_code='{code}'"
                result = subprocess.run([wrangler, "d1", "execute", "beanfit-app", "--local",
                                         "--persist-to", str(persist), "--command", query, "--json"],
                                        check=True, text=True, capture_output=True, timeout=30)
                device_id = json.loads(result.stdout)[0]["results"][0]["id"]
                before = read_saved(device_id)
                require_equal({key: before[key] for key in EXPECTED["hardware"]}, EXPECTED["hardware"], "pending hardware")
                require_equal(json.loads(before["payload_json"]), EXPECTED["snapshot"], "pending sanitized snapshot")
                require_equal(before["engine_version"], EXPECTED["engine_version"], "caller version")
                require_equal(before["use_case"], "coding", "snapshot use case")
                require_equal(before["status"], "pending", "pending state")
                require_equal(before["stack_json"], None, "pending stack")
                print("Content E2E pending: exact hardware and all eight sanitized ranked rows")
                csrf = re.search(r'name="csrf" value="([a-f0-9]+)"', confirmation)[1]
                detail_url, stack_url = f"/devices/{device_id}", f"/api/devices/{device_id}/stack"
                request(owner, detail_url, 404)
                request(owner, f"/pair/{code}/approve", 400, form={"csrf": "wrong"})
                require_equal(read_saved(device_id), before, "pending refusals preserve complete projection")
                request(owner, f"/pair/{code}/approve", form={"csrf": csrf})
                require_equal(process.wait(timeout=15), 0, "CLI approval")
                assert "Approved! Device registered." in log_path.read_text()
                approved = read_saved(device_id)
                wanted = dict(before, status="approved")
                require_equal(approved, wanted, "approval preserves snapshot/hardware")
                choices = {key: EXPECTED["stack"][key] for key in ["surfaces", "model_tag"]}
                started_at = datetime.now(timezone.utc)
                fragment = request(owner, stack_url, data=choices)
                saved = read_saved(device_id)
                stack = json.loads(saved["stack_json"])
                generated_at = stack.pop("generated_at")
                stamp = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
                assert started_at <= stamp <= datetime.now(timezone.utc), "stack timestamp outside generation window"
                require_equal(stack, EXPECTED["stack"], "complete stack including every step/file byte")
                require_equal({key: saved[key] for key in approved}, dict(approved, stack_json=saved["stack_json"]), "generation preserves snapshot/hardware")
                detail = request(owner, detail_url)
                assert fragment in detail, "owner GET must contain exact generated response fragment"
                assert "Synthetic &lt;CLI&gt; &amp; chip" in detail
                for name in ["Qwen3 8B", "DeepSeek Coder V2 16B", "Phi-4-reasoning 14B"]:
                    assert name in detail, "owner GET missing ranked model"
                request(other, detail_url, 404)
                request(other, stack_url, 404, data={"surfaces": ["api"], "model_tag": "gemma3:27b"})
                request(anonymous, detail_url, 303)
                request(anonymous, stack_url, 303, data=choices)
                require_equal(read_saved(device_id), saved, "owner reads and access refusals preserve exact content")
                print("Content E2E approved: exact full snapshot/stack, owner readback, and refusals PASS")
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    main()
