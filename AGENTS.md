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
  `plain.js` (human-language translation layer).

## Test commands
- Unit: `npm test`
- Full e2e (boots wrangler dev --local, local D1, drives the real CLI):
  `npm run test:e2e`
- E2E prerequisites are handled by the wrapper; `.dev.vars` (gitignored)
  carries SESSION_SECRET + dummy Google creds so SSO buttons render.

## Guardrails
- XSS discipline: every interpolated value passes `esc()`. New renderers
  inherit this or the PR is rejected.
- Auth gates: route-table flags own authentication. Handlers never re-check.
- Schema changes = additive D1 migrations in `migrations/`, applied via
  wrangler; never edit old migration files.
- Security posture: tokens stored hashed at rest; raw token exists only
  inside the approval UPDATE and the CLI handoff. Do not reintroduce
  persistence of raw credentials.
- `fit.js` mirrors beanfit's Python engine constants — changes must land in
  both repos together (conformance pin pending, audit X5).

## Known debt
Audit findings in `~/Desktop/BeanLabs/AUDIT-2026-08/findings/BFA-*.md`.

## Review rules
Binding contract: `~/beans/platform/qa-kit/README.md`. Done =
`python3 ~/beans/platform/qa-kit/bin/run_all.py --only beanfit-app --all`
(unit 43+ AND live e2e PASS).
