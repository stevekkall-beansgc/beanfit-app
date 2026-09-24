# beanfit-app

The account + device-registry layer for [beanfit](https://github.com/stevekkall-beansgc/beanfit):
what turns a one-shot CLI answer into an ongoing relationship.

## What it does (customer flow)

1. **Create an account** in the browser.
2. **Register your device**: run `beanfit register` in your terminal. The CLI
   detects hardware and computes recommendations *locally*, then starts a
   pairing request. The app stores the sanitized hardware profile and any
   supplied recommendation snapshot as a pending record before you approve it.
   Review that record in the browser, then approve or deny it.
3. **Get your stack**: the device page holds your recommendation snapshot
   (model × quant × runtime with honest uncertainty bands). Automatic
   update alerts are planned, not delivered by this version.

Privacy stance: Hardware detection runs locally. Pairing transmits the sanitized
hardware profile and any supplied recommendation snapshot to this app, which
stores them as a pending record before you approve it. Approval links that
pending record to your account. Pairing codes expire in 15 minutes; device
credentials are revocable.

## Retention cleanup: deployed and configured; automatic run pending

As of 2026-09-24, the released Worker route is deployed, the checked-in
`scripts/retention_cleanup.py` client is available to bean-sched, the bearer
secret is configured, and an authorized
manual production request returned HTTP 200. Bean-sched v0.5.7 has enabled
the sole recurring job: daily at 03:00 `America/New_York`. The first
automatic scheduled run has not happened yet. Ongoing retention is therefore
configured but not yet verified; make **no retention guarantee** and do not rely
on stale pairings disappearing until repeated scheduler-owned runs are
observed.

The implemented source contract, without making a claim about current
production execution: a device row with status `pending` or `denied` may be
deleted once `pair_expires_at` is at least 24 hours old; `approved` and
`revoked` rows are never touched, and rows with a NULL `pair_expires_at` are
never eligible. Each cleanup batch considers at most 100 candidate device
rows, and each route request runs at most 10 such batches, so one authorized
request considers at most 1,000 candidate device rows. These are
device-candidate bounds, not a fixed bound on all child rows or a promise that
one run drains the table. The operation is idempotent and parameterized by the
current Unix time.
Recommendations and outbound updates are deleted before their devices inside
one D1 batch; eligibility is re-asserted in every DELETE (safe under races),
only device ids are fetched, and no credential material is logged.

Activation is external. This app deliberately has no Cloudflare
`triggers.crons`, no `scheduled` handler, and no other HTTP route for cleanup;
bean-sched owns all recurring scheduling under the Bean one-clock rule. The
released route, client, bearer secret, and one enabled daily bean-sched job
are now in place, but the first automatic run is still pending. Follow
[RETENTION.md](RETENTION.md) for the generic source contract, activation
checks, current-status evidence, and deactivation steps.

## Architecture ($0 by design)

- **Cloudflare Workers** (SSR pages + JSON API) — no framework, no client
  build step, plain JS ES modules
- **CSP**: `script-src 'self'`; browser registration and configuration load
  from fixed same-origin endpoints backed by checked-in JS modules, so no inline
  script is authorized. The sole unsafe allowance is `style-src 'unsafe-inline'`,
  needed by the current shared `<style>` block and `style` attributes.
- **D1** (SQLite) for users / sessions / devices / recommendations / catalog /
  update outbox
- Sessions: DB-backed bearer tokens in HttpOnly cookies · CSRF via per-session
  HMAC tokens · passwords PBKDF2-SHA256 (100k iterations)
- Google SSO (see `GOOGLE-SSO.md`): a known Google identity signs in; a new
  email creates a passwordless account. Linking an existing account to Google
  is explicit only — an authenticated, CSRF-protected POST on the dashboard,
  with the OAuth state bound to that exact session. A matching email alone
  never links or takes over an account.
- The fit math here (`src/lib/fit.js`) mirrors the CLI engine so drift-watch
  could later re-fit stored devices against new catalog rows without calling
  the CLI; no alert delivery runs in this version

```
CLI (beanfit register)          Web app
  detect → evaluate ──POST──▶ /api/pair/start        (pending device + code)
  poll ◀─────────────GET───── /api/pair/status/:id       (status only)
  user approves in browser ─▶ /pair/:code/approve    (device claimed + token issued)
  credential ◀───────────────GET───── /api/pair/claim/:id (start-time secret)
  credential saved locally (owner-only file)
                                 drift-watch later: catalog diff × stored profiles
                                                   → outbound_updates outbox
```

## Development

```bash
npm install
npx wrangler d1 execute beanfit-app --local --file schema.sql   # first time
npx wrangler d1 execute beanfit-app --local --file migrations/0004_device_credential_handoff.sql
BEANFIT_SRC=../beanfit/src node scripts/sync_catalog.js         # load catalog
npm run dev                                                      # :8787
node --test                                                      # unit tests
./scripts/e2e-dev.sh                                             # full pairing E2E
npm run test:e2e                 # script regression, then supervised E2E with disposable local D1 and pinned Wrangler
bash test/e2e-local.test.sh      # script regression alone: isolation + failure propagation
```

## Deploying

See [DEPLOY.md](DEPLOY.md). Verify current Cloudflare limits and costs before
deploying a pilot.

---

**Agents:** see [AGENTS.md](AGENTS.md) before changing anything here.
