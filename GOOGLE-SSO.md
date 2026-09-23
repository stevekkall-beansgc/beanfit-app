# Google SSO setup (one-time, ~10 min, $0)

The callback URL for the live Worker is
<https://beanfit-app.steve-k-kall.workers.dev/auth/google/callback>.
Check the OAuth client's authorized redirect URIs in Google Cloud before
relying on Google sign-in; the Worker URL alone does not verify that setup.

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
3. Authorized redirect URIs — add all three:

   ```
   http://localhost:8787/auth/google/callback      ← local dev
   http://127.0.0.1:8787/auth/google/callback      ← local dev (alt host)
   https://beanfit-app.steve-k-kall.workers.dev/auth/google/callback   ← current live Worker
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

# Production secrets (first-time setup or OAuth client replacement only):
npx wrangler secret put GOOGLE_CLIENT_ID     # paste client id
npx wrangler secret put GOOGLE_CLIENT_SECRET # paste client secret
```

## How the flow works (for review)

Two entry points share the same callback. The callback only ever acts on the
state that initiated it; a link-mode state is cryptographically bound to the
initiating user's session.

```
GET /auth/google/start            (sign-in / sign-up)
  ├─ mints signed state (nonce + safe next-path + 10-min expiry)
  └─ 302 accounts.google.com (state cookie HttpOnly/SameSite=Lax)

POST /auth/google/link            (explicit linking: session required + CSRF)
  ├─ mints signed state bound to {user id, sha256(session token)}
  └─ 302 accounts.google.com

GET /auth/google/callback
  ├─ cookie state === query state (timing-safe) else reject
  ├─ code → token endpoint (server-to-server TLS)
  ├─ id_token RS256 signature verified (Web Crypto) against key material
  │   fetched from the pinned Google discovery + JWKS endpoints
  │   (https://accounts.google.com/.well-known/openid-configuration →
  │   https://www.googleapis.com/oauth2/v3/certs — jwks_uri allowlisted,
  │   token-supplied URLs ignored, keys cached per cache headers, fails
  │   closed on malformed JWT / unknown kid / bad signature)
  ├─ id_token claims validated: iss/aud/exp/nonce,
  │   email_verified must be exactly true, sub must be a nonempty string
  └─ identity resolution:
       link-mode state:
         session still authenticated AND matches the binding → link to THAT
              user (idempotent; a simultaneous link race is re-read and
              accepted only for the same bound user)
         identity already linked to a different user → rejected
         session missing/changed → rejected (fail closed)
       sign-in state:
         known identity            → session
         email matches an account  → rejected — an email alone never links
              or takes over an account. Sign in with your password first,
              then link Google from the dashboard.
         new email                 → passwordless user + identity → session
```

The link button lives on the dashboard (Account card); it POSTs
`/auth/google/link` with the session's CSRF token, so only someone already
signed in to the target account can attach a Google identity — and only for
the exact session that started the flow. There is deliberately no
email-match linking: the old behavior (a verified Google email silently took
over the account with that email) has been removed.

After a successful link the callback bounces to `/dashboard?linked=google`;
the dashboard shows the "Google account linked" success notice only when the
current user's Google identity is actually present — a forged query alone
never prints a false confirmation (see `test/dashboard-notice.test.js`).

Passwordless accounts cannot use the email form (`pw_hash` empty) — the form
tells them to sign in with Google. Provider table is generic
(`user_identities.provider`), so Microsoft/GitHub later = same schema.

## Test matrix

| Case | Expected |
|------|----------|
| New Gmail signs up via Google | account created, straight to dashboard |
| Known Google identity signs in | session for the linked account |
| Existing email-password user signs in via Google (email match only) | rejected — no linking, no session; sign in with password then link from dashboard |
| Link from dashboard (session + CSRF) | Google identity linked to that account |
| Link callback with a different/missing session | rejected (fail closed) |
| Google identity already linked to another account | rejected |
| Concurrent link races | re-read; only the same bound user wins, others rejected |
| Cancel at Google | back on login form with message |
| Tampered/expired state | rejected, no session |
| Unsigned/forged id_token, unknown `kid`, bad signature | rejected at signature gate, no claims, no identity, no session |
| JWKS/discovery fetch failure | rejected (fail closed), no identity, no session |
| `email_verified` not exactly true / missing `sub` | claims rejected, no session |
| `?linked=google` on dashboard without a linked identity | no success notice |
