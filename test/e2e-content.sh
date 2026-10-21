#!/usr/bin/env bash
# Owned exact-content E2E; use the disposable e2e-local.sh wrapper, never a hosted URL.
set -euo pipefail
python3 -B test/e2e-content.py "$1" "${E2E_LOCAL_PERSIST:?use scripts/e2e-local.sh}"
