# beanfit-app

The account + device-registry layer for [beanfit](https://github.com/stevekkall-beansgc/beanfit):
what turns a one-shot CLI answer into an ongoing relationship.

## What it does (customer flow)

1. **Create an account** in the browser.
2. **Register your device**: run `beanfit register` in your terminal. The CLI
   detects hardware and computes recommendations *locally*, then shows you a
   pairing code. Approve it on the web — you see exactly what gets stored
   before you approve.
3. **Get your stack**: the device page holds your recommendation snapshot
   (model × quant × runtime with honest uncertainty bands). Automatic
   update alerts are planned, not delivered by this version.

Privacy stance: detection runs locally, but the sanitized hardware profile and
recommendation snapshot are transmitted and stored as a pending record when
pairing starts, *before* web approval. Approval attaches that record to an
account. Denied or expired pending records are not automatically deleted yet.
Pairing codes expire in 15 minutes; device credentials are revocable.

## Architecture ($0 by design)

- **Cloudflare Workers** (SSR pages + JSON API) — no framework, no client
  build step, plain JS ES modules
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
