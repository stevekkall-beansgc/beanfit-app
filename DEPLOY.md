# Deploying beanfit-app ($0)

All steps run on Cloudflare's free tier. Estimated total: $0/month at pilot
scale (Workers free = 100k req/day, D1 free = 5M row reads/day).

## First deploy (one-time, ~10 min)

```bash
# 1. Authenticate (opens browser)
npx wrangler login

# 2. Create the production database
npx wrangler d1 create beanfit-app
#   → copy the database_id into wrangler.jsonc

# 3. Apply schema
npx wrangler d1 execute beanfit-app --remote --file schema.sql

# 4. Set secrets (value from BeanLaunch secret store, never committed)
bl get beanfit-app-session-secret | npx wrangler secret put SESSION_SECRET

# 5. Ship + load catalog
BEANFIT_SRC=../beanfit/src node scripts/sync_catalog.js --remote
npx wrangler deploy

# 6. Point the CLI at it (later: becomes the default URL)
export BEANFIT_SERVER=https://beanfit-app.<your-subdomain>.workers.dev
```

## Verify

```bash
curl -o /dev/null -w "%{http_code}\n" $BEANFIT_SERVER/     # 200
./scripts/e2e-dev.sh $BEANFIT_SERVER                        # full pairing loop
```

## Production hardening backlog (before any real traffic)

- [ ] Turn on Cloudflare rate limiting rule for `/login` and `/api/pair/*`
      (free WAF rules cover this)
- [ ] Swap dev stack-trace error page (already gated on ENVIRONMENT var)
- [ ] Add `Content-Security-Policy` header to layout responses
- [ ] Email verification before pairing approval (Resend free tier or Pulse)
- [ ] Device revocation UI (`POST /devices/:id/revoke`) — schema-ready,
      route pending
