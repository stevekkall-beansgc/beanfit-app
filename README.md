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

## Retention cleanup: core + bearer-gated endpoint — not proven active

A bounded cleanup core exists for stale, unclaimed pairing records
(`src/lib/cleanup.js`), and a **bearer-gated
`POST /api/maintenance/retention-cleanup` endpoint is implemented**
(`src/routes/maintenance.js`). This repository contains no recurring
invocation, and source or tests cannot establish whether a deployed target is
active. Until the route, secret, and external bean-sched invocation are
verified for that target, make **no retention guarantee** and expect rows to
continue accumulating.

The implemented policy, without making a claim about any deployed target: a
device row with
status `pending` or `denied` may be deleted once `pair_expires_at` is at least
24 hours old; `approved` and `revoked` rows are never touched, and rows with a
NULL `pair_expires_at` are never eligible. The core is bounded (hard cap of
100 candidate rows per invocation), idempotent, parameterized by the current
unix time, deletes child `recommendations`/`outbound_updates` rows before their
devices inside one D1 batch, re-asserts eligibility in every DELETE (safe under
races), fetches only device ids, and never logs — so no credential material can
leak to worker logs.

Activation is **not performed by this repository**: this app deliberately has
no Cloudflare `triggers.crons`, no `scheduled` handler, and **no other HTTP route
for cleanup**. The bearer-gated endpoint exists but requires **three things**
before it becomes live: (1) `RETENTION_CLEANUP_TOKEN` provisioned in the
environment, (2) an **external bean-sched job registered** to call it on an
approved cadence, and (3) deployment of both. Bean-sched owns all recurring
scheduling (Bean one-clock rule). Until all three are in place, do not rely on
stale pairings disappearing. Follow
[RETENTION.md](RETENTION.md) for the activation contract, bounded synthetic
checks, deployed-versus-inert evidence, and deactivation steps.

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
