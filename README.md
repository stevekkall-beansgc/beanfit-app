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
   (model × quant × runtime with honest uncertainty bands). Registered
   devices are how beanfit reaches you when a better model fits your machine.

Privacy stance: detection runs locally; only the profile shown at approval is
transmitted; pairing codes expire in 15 minutes; device credentials are
revocable.

## Architecture ($0 by design)

- **Cloudflare Workers** (SSR pages + JSON API) — no framework, no client
  build step, plain JS ES modules
- **D1** (SQLite) for users / sessions / devices / recommendations / catalog /
  update outbox
- Sessions: DB-backed bearer tokens in HttpOnly cookies · CSRF via per-session
  HMAC tokens · passwords PBKDF2-SHA256 (120k iters)
- The fit math here (`src/lib/fit.js`) mirrors the CLI engine so drift-watch
  can re-fit stored devices against new catalog rows without calling the CLI

```
CLI (beanfit register)          Web app
  detect → evaluate ──POST──▶ /api/pair/start        (pending device + code)
  poll ◀─────────────GET───── /api/pair/status/:id
  user approves in browser ─▶ /pair/:code/approve    (device claimed + token issued)
  credential saved locally
                                 drift-watch later: catalog diff × stored profiles
                                                   → outbound_updates outbox
```

## Development

```bash
npm install
npx wrangler d1 execute beanfit-app --local --file schema.sql   # first time
BEANFIT_SRC=../beanfit/src node scripts/sync_catalog.js         # load catalog
npm run dev                                                      # :8787
node --test                                                      # unit tests
./scripts/e2e-dev.sh                                             # full pairing E2E
```

## Deploying

See [DEPLOY.md](DEPLOY.md). Still $0 on Cloudflare free tiers at pilot scale.
