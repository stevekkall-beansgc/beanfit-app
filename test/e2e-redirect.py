"""Return-path regression through the disposable Worker and local D1."""
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


base, email = sys.argv[1:]
assert urllib.parse.urlsplit(base).hostname in ("localhost", "127.0.0.1", "::1")
opener = urllib.request.build_opener(NoRedirect)


def request(path, form=None):
    data = urllib.parse.urlencode(form).encode() if form else None
    req = urllib.request.Request(base + path, data=data)
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as response_error:
        response = response_error
    with response:
        return response.code, response.headers, response.read().decode()


unsafe = ["/\\outside.invalid", "/\t/outside.invalid", "/\n/outside.invalid", "//outside.invalid"]
safe = ["/pair/ABCD2345?tab=stack#details", "/a/..//outside.invalid"]
for next_path in unsafe + safe:
    expected = next_path if next_path in safe else "/dashboard"
    status, headers, _ = request("/login", {
        "email": email, "password": "e2e-password-123", "next": next_path,
    })
    assert status == 303, ("login", status)
    assert headers["Location"] == expected, ("login", repr(next_path), headers["Location"])
    assert headers["Set-Cookie"].startswith("bf_session=")

    query = urllib.parse.urlencode({"next": next_path})
    status, headers, _ = request("/auth/google/start?" + query)
    assert status == 303, ("Google start", status)
    google = urllib.parse.urlsplit(headers["Location"])
    assert google.netloc == "accounts.google.com"
    state = urllib.parse.parse_qs(google.query)["state"][0].split(".")[0]
    payload = json.loads(base64.urlsafe_b64decode(state + "=" * (-len(state) % 4)))
    assert payload["p"] == (next_path if next_path in safe else "")

for next_path in [unsafe[0], safe[0]]:
    status, headers, _ = request("/signup", {
        "email": f"redirect-{uuid.uuid4().hex}@test.local",
        "password": "e2e-password-123", "next": next_path,
    })
    assert status == 303, ("signup", status)
    assert headers["Location"] == (next_path if next_path in safe else "/dashboard")

print("Auth return paths HTTP E2E PASS (password login, signup, Google initiation)")
