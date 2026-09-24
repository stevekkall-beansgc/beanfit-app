#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

TOKEN_ENV = "RETENTION_CLEANUP_TOKEN"
ENDPOINT_PATH = "/api/maintenance/retention-cleanup"
REQUEST_TIMEOUT_SECONDS = 30
MAX_RESPONSE_BYTES = 64 * 1024
COUNT_KEYS = (
    "batches",
    "candidates",
    "recommendationsDeleted",
    "outboxDeleted",
    "devicesDeleted",
)


def endpoint_for(base_url):
    if not isinstance(base_url, str) or not base_url:
        raise ValueError("an explicit HTTPS base URL is required")
    if any(character in base_url for character in "\r\n"):
        raise ValueError("an explicit HTTPS base URL is required")
    parsed = urlsplit(base_url)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise ValueError("an explicit HTTPS base URL is required")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("the base URL must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("the base URL must not contain a query or fragment")
    if parsed.path not in ("", "/"):
        raise ValueError("the base URL must be an origin without a path")
    return f"https://{parsed.netloc}{ENDPOINT_PATH}"


def counts_from_body(body):
    try:
        payload = json.loads(body)
    except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    counts = {}
    for key in COUNT_KEYS:
        value = payload.get(key)
        if type(value) is not int or value < 0:
            return None
        counts[key] = value
    return counts


def print_status(status, stream=None):
    output = sys.stderr if stream is None else stream
    if type(status) is int:
        print(f"retention cleanup: status={status}", file=output)
    else:
        print("retention cleanup: request failed", file=output)


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: retention_cleanup.py HTTPS_BASE_URL", file=sys.stderr)
        return 2

    try:
        endpoint = endpoint_for(args[0])
    except ValueError:
        print("retention cleanup: an explicit HTTPS base URL is required", file=sys.stderr)
        return 2

    token = os.environ.get(TOKEN_ENV)
    if not token or not token.strip():
        print(f"retention cleanup: {TOKEN_ENV} is required", file=sys.stderr)
        return 2

    try:
        request = urllib.request.Request(
            endpoint,
            data=b"",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            status = response.getcode()
            if type(status) is not int:
                raise ValueError("invalid response status")
            if not 200 <= status < 300:
                print_status(status)
                return 1
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        print_status(error.code)
        return 1
    except Exception:
        print("retention cleanup: request failed", file=sys.stderr)
        return 1

    if isinstance(body, str):
        body = body.encode("utf-8")
    if not isinstance(body, (bytes, bytearray)):
        print("retention cleanup: invalid response", file=sys.stderr)
        return 1
    if len(body) > MAX_RESPONSE_BYTES:
        print("retention cleanup: response too large", file=sys.stderr)
        return 1
    counts = counts_from_body(body)
    if counts is None:
        print("retention cleanup: invalid response", file=sys.stderr)
        return 1

    fields = " ".join(f"{key}={counts[key]}" for key in COUNT_KEYS)
    print(f"retention cleanup: status={status} {fields}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
