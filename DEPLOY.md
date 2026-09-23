# Deploying beanfit-app ($0)

All steps run on Cloudflare's free tier. Estimated total: $0/month at pilot
scale (Workers free = 100k req/day, D1 free = 5M row reads/day).

## Current live Worker

- Public URL: <https://beanfit-app.steve-k-kall.workers.dev>
- Google callback: <https://beanfit-app.steve-k-kall.workers.dev/auth/google/callback>

The Worker and D1 database already exist. The commands below are first-time
instructions for a new account or replacement Worker, not routine setup for the
current live deployment.

## First deploy (one-time, ~10 min)

```bash
# 1. Authenticate (opens browser)
npx wrangler login

# 2. Create the production database
npx wrangler d1 create beanfit-app
#   → copy the database_id into wrangler.jsonc

# 3. Apply schema
npx wrangler d1 execute beanfit-app --remote --file schema.sql
npx wrangler d1 execute beanfit-app --remote --file migrations/0002_user_identities.sql
npx wrangler d1 execute beanfit-app --remote --file migrations/0003_device_stack.sql
npx wrangler d1 execute beanfit-app --remote --file migrations/0004_device_credential_handoff.sql

# 4. Set secrets (values from BeanLaunch secret store, never committed)
bl get beanfit-app-session-secret | npx wrangler secret put SESSION_SECRET
gcloud secrets versions access latest --secret=google-client-id --project=beansgc-beanfit | npx wrangler secret put GOOGLE_CLIENT_ID
gcloud secrets versions access latest --secret=google-client-secret --project=beansgc-beanfit | npx wrangler secret put GOOGLE_CLIENT_SECRET

# 5. Ship + load catalog
BEANFIT_SRC=../beanfit/src node scripts/sync_catalog.js --remote
npx wrangler deploy

# 6. Point the CLI at it
export BEANFIT_SERVER=https://beanfit-app.steve-k-kall.workers.dev

# 7. Add the workers.dev callback URI to the Google OAuth client
#    (see GOOGLE-SSO.md step 2) — SSO goes live after that.
```

## Verify

```bash
curl -I https://beanfit-app.steve-k-kall.workers.dev/   # non-mutating live smoke check
npm run test:e2e                                       # local disposable D1 only
```

Do not run `scripts/e2e-dev.sh` against the public Worker as a smoke test: it
creates an account and approves a device.

## Production hardening status

- [x] Repository code and Workers Rate Limiting bindings cover `POST /signup`,
      `POST /login`, and `POST /api/pair/start`; missing production bindings fail closed.
- [x] Dev stack-trace error page is gated on the `ENVIRONMENT` var.
- [x] HTML responses carry a restrictive `Content-Security-Policy`.
- [ ] Email verification before pairing approval (Resend free tier or Pulse)
- [x] Device revocation UI invalidates the stored credential hash. A device
      must be paired again after revocation.

Cloudflare's binding counters are per location and eventually consistent, not
exact global accounting. These IP-keyed buckets can affect multiple legitimate
users on a shared network.

The checklist describes repository code. Confirm the active Worker version and
response headers separately after deployment; a GitHub release does not update
the live Worker.
