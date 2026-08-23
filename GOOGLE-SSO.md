# Google SSO setup (one-time, ~10 min, $0)

The GCP side is done except two console-only steps that need your Google
login. This doc is the exact walkthrough.

## Already done (2026-08-23)

- ✅ Project **`beansgc-beanfit`** created (separate from BeanLaunch infra —
  blast-radius isolation, product-scoped consent screen, clean billing)
- ✅ Billing linked to account `01E814-340520-49703A`
- ✅ Budget guard **`beanfit-guard`**: $10/mo, alerts at 50% / 90% / 100%
  (mirrors `beanlaunch-guard`)
- ✅ Secret Manager API enabled

## Step 1 — OAuth consent screen (console)

1. Go to <https://console.cloud.google.com/apis/credentials?project=beansgc-beanfit>
2. If prompted, configure consent screen: **External** → Create.
3. Fill: App name `beanfit` · User support email `steve.k.kall@gmail.com` ·
   Developer contact same. Everything else can stay default; scopes needed are
   only basic (`openid`, `email`, `profile`) → no verification process while
   under 100 users (test mode). Publish when ready for real users.

## Step 2 — OAuth client

1. Credentials → **Create credentials → OAuth client ID**
2. Type: **Web application**
3. Authorized redirect URIs — add BOTH:

   ```
   http://localhost:8787/auth/google/callback      ← local dev
   http://127.0.0.1:8787/auth/google/callback      ← local dev (alt host)
   https://beanfit-app.<YOUR-SUBDOMAIN>.workers.dev/auth/google/callback   ← add after first deploy
   ```

4. Create → copy the **Client ID** and **Client secret**.

## Step 3 — Store secrets (GSM source of truth, per standing rules)

```bash
# In the beanfit-app repo dir with an .env.local containing:
#   GCP_PROJECT_ID=beansgc-beanfit
gcloud secrets create google-client-id    --project beansgc-beanfit --data-file=- <<< "PASTE_CLIENT_ID"
gcloud secrets create google-client-secret --project beansgc-beanfit --data-file=- <<< "PASTE_SECRET"
```

## Step 4 — Wire into Cloudflare

```bash
# Local dev (values already placeholdered in .dev.vars — replace them):
#   .dev.vars:  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET

# Production (after wrangler login):
npx wrangler secret put GOOGLE_CLIENT_ID     # paste client id
npx wrangler secret put GOOGLE_CLIENT_SECRET # paste client secret
```

## How the flow works (for review)

```
GET /auth/google/start
  ├─ mints signed state (nonce + safe next-path + 10-min expiry)
  └─ 302 accounts.google.com (state cookie HttpOnly/SameSite=Lax)
GET /auth/google/callback
  ├─ cookie state === query state (timing-safe) else reject
  ├─ code → token endpoint (server-to-server TLS)
  ├─ id_token claims validated: iss/aud/exp/nonce/email_verified
  └─ identity resolution:
       known identity            → session
       email matches account     → link identity → session
       new email                 → passwordless user + identity → session
```

Passwordless accounts cannot use the email form (`pw_hash` empty) — the form
tells them to sign in with Google. Provider table is generic
(`user_identities.provider`), so Microsoft/GitHub later = same schema.

## Test matrix

| Case | Expected |
|------|----------|
| New Gmail signs up via Google | account created, straight to dashboard |
| Existing email-password user signs in via Google | identity linked, same account |
| Cancel at Google | back on login form with message |
| Tampered/expired state | rejected, no session |
