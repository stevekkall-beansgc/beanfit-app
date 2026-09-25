# AGENTS.md — beanfit-app

Zero-dependency Cloudflare Workers + D1 SSR app. No framework, no client
build step; plain JS string templates with strict escaping.

## Layout
- `src/index.js` — declarative route table (auth flags live HERE only).
- `src/pages.js` — SSR renderers (`authForm`, dashboard, pairing, stacks).
- `src/routes/` — `auth.js` (SSO/sessions), `pair.js` (device pairing +
  stack configurator).
- `src/lib/` — `store.js` (D1 repos), `oauth.js`/`crypto.js`/`http.js`,
  `stack.js` (generator), `fit.js` (JS mirror of beanfit's engine math),
  `plain.js` (human-language translation layer), `cleanup.js` (bounded D1
  retention core for stale pairing records; production cleanup is owned by
  the external bean-sched job; see README and RETENTION.md for current
  deployment status).

## Test commands
- Unit: `npm test`
- Full e2e (boots wrangler dev --local, local D1, drives the real CLI):
  `npm run test:e2e`
- E2E prerequisites are handled by the wrapper; `.dev.vars` (gitignored)
  carries SESSION_SECRET + dummy Google creds so SSO buttons render.

## Guardrails
- Bean one-clock rule: bean-sched owns ALL recurring scheduling. Never add a
  Cloudflare cron trigger, `scheduled` handler, GitHub cron, or any other
  timer to this app.
- Retention status (2026-09-25): the released Worker route is deployed, the
  checked-in client is available to bean-sched, the bearer secret is
  configured, and an authorized manual production run
  returned 200. Bean-sched v0.5.7 has enabled the sole daily 03:00
  `America/New_York` cleanup job. Its first automatic run returned 200 with
  zero eligible candidates and deletions on 2026-09-25 at 03:00 EDT.
  Keep the no-guarantee posture until repeated scheduled runs are observed;
  see `RETENTION.md`.
- XSS discipline: every interpolated value passes `esc()`. New renderers
  inherit this or the PR is rejected.
- Auth gates: route-table flags own authentication. Handlers never re-check.
- Schema changes = additive D1 migrations in `migrations/`, applied via
  wrangler; never edit old migration files.
- Security posture: tokens stored hashed at rest; raw token exists only
  inside the approval UPDATE and the CLI handoff. Do not reintroduce
  persistence of raw credentials.
- Account linking is explicit only: never link a Google (or any) identity to
  an existing account by email match alone. Linking requires the authenticated
  session + CSRF initiation with OAuth state bound to that session.
- Google id_tokens are trusted only after RS256 signature verification
  against key material from the pinned Google discovery/JWKS endpoints
  (src/lib/jwks.js, fail closed). Claims validation and identity/session/link
  resolution never run for an unverified or unsigned token.
- `fit.js` mirrors beanfit's Python engine constants — changes must land in
  both repos together (conformance pin pending, audit X5).

## Known debt
Audit findings in `~/beans/labs/beanlabs/AUDIT-2026-08/findings/BFA-*.md`.

## Review rules
Binding contract: `~/beans/platform/qa-kit/README.md`. Done =
`python3 ~/beans/platform/qa-kit/bin/run_all.py --only beanfit-app --all`
(unit 43+ AND live e2e PASS).
