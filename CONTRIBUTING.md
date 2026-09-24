# Contributing to beanfit-app

This guide is self-contained. beanfit-app is a zero-runtime-dependency
Cloudflare Worker with server-rendered pages, a small JSON API, and D1. Source
is plain ES modules and string templates; there is no client build step.

## Prerequisites

- Node.js 22.5 or newer and npm. This provides the built-in `node:sqlite`
  module used by the offline D1 integration tests.
- Bash, `curl`, and Python 3 for the full E2E suite.
- A separate checkout of the beanfit CLI source for the full E2E suite. The
  checkout must contain the importable `beanfit` package under its `src`
  directory; set `BEANFIT_SRC` to that absolute path. The CLI is not vendored
  in this repository.

Cloudflare credentials are not needed for unit tests or the full E2E suite.
Both run locally; do not point either suite at a deployed Worker.

## Local setup

From the repository root:

```bash
npm ci
```

Use `npm ci`, not an unlocked install, so the checked-in lockfile and pinned
Wrangler version are used. Do not add a runtime dependency without first
reviewing the zero-runtime-dependency contract in `test/deps-contract.test.js`.

For manual development, create the gitignored `.dev.vars` file with these keys;
replace each angle-bracketed value with a local-only value:

```dotenv
SESSION_SECRET=<random-local-only-value>
GOOGLE_CLIENT_ID=<local-only-placeholder>
GOOGLE_CLIENT_SECRET=<local-only-placeholder>
ENVIRONMENT=dev
```

Never place production or shared credentials in this file. On a fresh local D1
state, apply the schema and every migration in order:

```bash
npx wrangler d1 execute beanfit-app --local --file schema.sql
for file in migrations/*.sql; do
  npx wrangler d1 execute beanfit-app --local --file "$file"
done
BEANFIT_SRC=/absolute/path/to/beanfit/src node scripts/sync_catalog.js
npm run dev
```

The Worker listens on `http://127.0.0.1:8787` by default. The catalog sync is
optional for exercising pairing. Do not rerun schema or migration files against
an existing local database; use the disposable E2E setup below for repeatable
runs.

## Tests

Run the offline suite first:

```bash
npm test
```

Then run the full local E2E suite:

```bash
BEANFIT_SRC=/absolute/path/to/beanfit/src npm run test:e2e
```

`npm run test:e2e` first checks the E2E wrapper's failure behavior, then boots
the pinned Wrangler with `--local`, creates a fresh disposable D1 database,
applies `schema.sql` and all migrations, and drives the real beanfit CLI through
signup, pairing, approval, and credential handoff. It removes the disposable
database on success or failure. If port 8787 is occupied, set `E2E_PORT` to a
free port. A pre-existing `.dev.vars` is preserved.

Before requesting review, also run:

```bash
git diff --check
```

There is currently no lint or typecheck script. Do not claim either was run.
If either is added, document its exact command here and in `package.json`.

## Security-sensitive changes

Changes in the following areas require focused tests and an explicit review of
the invariants, not only a green aggregate suite:

- **Authentication and account linking:** route-table flags own authentication;
  handlers do not duplicate gates. Browser mutations require the appropriate
  session and CSRF checks. A matching email must never link or take over an
  account. Google identity linking must remain authenticated, CSRF-protected,
  and bound to the initiating session.
- **Google tokens:** verify RS256 signatures against pinned discovery/JWKS key
  material before validating claims or resolving an identity. Malformed,
  unsigned, incorrectly keyed, or unverifiable tokens must fail closed.
- **Sessions and credentials:** keep raw session and device credentials out of
  D1, logs, URLs, error pages, and test output. Persist only the intended
  digests. The pair claim secret must remain a start-time handoff and must not
  be recoverable from a pair ID.
- **Rendering and browser assets:** every interpolated value in `src/pages.js`
  must pass through `esc()`. Browser behavior stays in checked-in same-origin
  modules; do not add inline script or weaken the CSP. Add hostile-input tests
  for new renderers.
- **Retention cleanup:** preserve the exact policy and fail-closed behavior.
  Only stale `pending` and `denied` rows with a non-null `pair_expires_at` are
  eligible. `approved`, `revoked`, fresh, and null-expiry rows must survive.
  Every DELETE must re-check eligibility, children must be removed before their
  device in the D1 batch, and each request must stay within the 1,000 candidate
  device cap. Missing, wrong, or empty maintenance secrets must return 401
  without running cleanup. Keep responses counts-only and free of row IDs or
  credential material.
- **Scheduling:** bean-sched is the only recurring scheduler. Never add a
  Cloudflare cron trigger, `scheduled` handler, GitHub schedule, app-local
  timer, or scheduler job registry to this repository. An external invocation
  does not make the cleanup active until the route is deployed, its secret is
  provisioned, and a bean-sched job is independently verified.
- **D1 and dependencies:** schema changes are new, additive migration files;
  never edit an applied migration. Keep SQL parameterized, and retain the
  patched, development-only dependency pins covered by the dependency contract
  tests.
- **Fit math:** changes to `src/lib/fit.js` must identify the corresponding
  beanfit engine change and conformance evidence. Do not silently let the two
  implementations drift.

Never weaken a security assertion merely to make a test pass. Keep failures
observable through sanitized status codes, counts, and test output. Before
opening a pull request, inspect the complete diff, confirm no secrets or
generated local state are included, and report the exact test commands and
results. Deployment and release are separate from contribution and must not be
performed unless explicitly requested.
