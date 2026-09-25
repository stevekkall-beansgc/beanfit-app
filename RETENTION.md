# Pairing retention activation and verification runbook

## Current production status (2026-09-25)

The released `POST /api/maintenance/retention-cleanup` route is deployed,
the checked-in `scripts/retention_cleanup.py` client is available to
bean-sched, the bearer secret is configured, and an authorized manual
production request returned HTTP 200.
Bean-sched v0.5.7 has enabled the sole daily cleanup job at 03:00
`America/New_York`. Its first scheduled execution completed at 2026-09-25
03:00 EDT with HTTP 200, one batch, and zero eligible candidates or
deletions, as recorded in bean-sched's local history.

This establishes deployment, bearer authorization, and scheduler
configuration, plus one observed automatic call. It does not establish
repeated operation or demonstrate an automatic deletion. Describe the target
as **active for one observed scheduled run**, and make **no retention
guarantee** until repeated scheduler-owned runs are observed.

## Generic source contract

This repository contains a bounded cleanup core (`src/lib/cleanup.js`) and a
bearer-gated `POST /api/maintenance/retention-cleanup` route
(`src/routes/maintenance.js`). It contains no recurring schedule, scheduler
configuration, credential, or guarantee that any deployed system invokes the
route.

Source, tests, a tag, or a release do not prove what is deployed. For any
target environment, the activation contract requires all three independent
facts:

1. A revision containing this route is deployed to that Worker.
2. `RETENTION_CLEANUP_TOKEN` is provisioned on that same deployed Worker.
3. One external bean-sched command job is enabled and invokes the checked-in
   client through an approved private wrapper.

This runbook defines the operator contract; this repository does not register
or enable the live job. Activation is external to this repository. The
current production status above is distinct from this generic source
contract.

| Verified state | Accurate claim |
| --- | --- |
| Source only, or unauthenticated probe returns 401 | Route is not proven active; no retention guarantee |
| Route and secret exist, but no enabled bean-sched command job | No recurring invocation; manual calls are the only possible invocations |
| All three exist, but no scheduled run is observed | Configured but unverified; no ongoing-retention claim |
| One scheduler-owned run returns 2xx | One scheduled call succeeded; no ongoing-retention claim |
| Scheduler-owned runs repeatedly return 2xx | Cleanup is active for that deployed target; rows remain subject to the policy and caps |

## Implemented behavior

- The route accepts only `POST`; the Authorization header must contain the
  provisioned bearer token. Missing, wrong, or empty configuration fails closed
  with 401 before cleanup runs.
- A device is eligible only when its status is `pending` or `denied`, its
  `pair_expires_at` is non-null, and that expiry is at least 24 hours old.
  `approved`, `revoked`, fresh, and null-expiry devices are never eligible.
- Recommendations and outbound updates are deleted before their device inside
  one D1 batch. Every delete re-checks eligibility, and successful responses
  contain counts only.
- Each cleanup batch considers at most 100 candidate device rows. Each route
  request runs at most 10 such batches, so one authorized request considers at
  most 1,000 candidate device rows. These are device-candidate bounds, not a
  fixed bound on all child rows or a promise that one run drains the table.
- The operation is idempotent for the same data. A replay after the eligible
  synthetic rows are gone must report zero candidates and zero deletions.
- `scripts/retention_cleanup.py` is a standalone, stdlib-only one-shot HTTPS
  client. It accepts exactly one explicit HTTPS base URL, reads the bearer
  token only from `RETENTION_CLEANUP_TOKEN`, posts to the route with a finite
  timeout and the stable `beanfit-retention/0.4.2` User-Agent, and prints only a
  sanitized status and known integer counts. It never accepts a token as a
  command-line argument or prints a response body.

## Bounded offline acceptance

From the repository root:

```bash
node --test \
  test/cleanup.test.js \
  test/maintenance-route.test.js \
  test/cleanup-d1-integration.test.js
python3 -m unittest discover -s test -p 'test_retention_cleanup_client.py'
```

These commands use fakes, mocked `urllib`, and in-memory SQLite; they do not
need a Cloudflare account, external network, or remote D1. Acceptance requires
all of the following:

- the inclusive 24-hour boundary and status/null exclusions pass;
- only stale `pending` and `denied` synthetic devices are removed;
- child-first deletion leaves no orphan and preserves protected rows;
- missing, wrong, and absent maintenance tokens return 401 and delete nothing;
- full candidate pages stop at the 1,000-device route cap;
- a real-SQLite replay after deletion performs no second D1 batch and returns
  zero candidates and zero deletions;
- no cron trigger, scheduled handler, app-local timer, or in-repository
  scheduler registry is present;
- the client rejects non-HTTPS URLs and missing environment credentials,
  sends one authenticated POST with the stable User-Agent and a timeout, rejects
  non-2xx responses, and emits no token or raw response body.

For any future activation or change, also run the normal gates:

```bash
npm test
BEANFIT_SRC=/absolute/path/to/beanfit/src npm run test:e2e
git diff --check
```

## Activation and change sequence

The following is the generic operator contract for a new target or a later
change; it is not the current production state. As of 2026-09-25, the one
production job is enabled and one automatic run has succeeded.

1. Complete offline acceptance and obtain approval for the intended retention
   cadence and operational owner. Do not create a second scheduler.
2. Provision a new high-entropy `RETENTION_CLEANUP_TOKEN` through the target
   platform's secret mechanism. For the Wrangler deployment documented in this
   repository, the non-printing prompt is:

   ```bash
   npx wrangler secret put RETENTION_CLEANUP_TOKEN
   ```

   Store the value only in the approved secret system. Never put it in source,
   `.dev.vars`, a URL, a job body, command history, or verification output.
3. Deploy the route-bearing revision through the normal deployment process,
   record the deployed version, and verify the deployment metadata names that
   revision. For the Wrangler deployment documented in this repository, run
   `npx wrangler deploy`. A Git commit or release does not update the live
   Worker.
4. Probe the deployed route without a token. This cannot run cleanup:

   ```bash
   export BEANFIT_BASE_URL='https://<deployed-worker-host>'
   curl --silent --show-error --include --request POST \
     "$BEANFIT_BASE_URL/api/maintenance/retention-cleanup"
   ```

   Require HTTP 401. A 404 means this route is not deployed. This 401 confirms
   fail-closed routing only; it does not prove that the configured secret and
   the private wrapper/client path are correct.
5. For a new target or replacement, configure exactly one **command** job in
   bean-sched. Do not create an HTTP job: bean-sched HTTP jobs expose only
   `url` and `method`, so they cannot supply the `Authorization` header
   required by this route. The command job must invoke an approved private
   wrapper that lives outside this repository.
   The wrapper must:

   - retrieve `RETENTION_CLEANUP_TOKEN` from the approved secret system at
     runtime and export it only for the client process;
   - invoke the checked-in client with the explicit deployed origin:
     `python3 /absolute/path/to/beanfit-app/scripts/retention_cleanup.py https://<deployed-worker-host>`;
   - keep the secret out of its arguments, command definition, logs, and
     verification output; and
   - propagate the client's exit status and sanitized output without printing
     the token or raw response body.

   Configure the command job with an explicitly approved cadence, a finite
   timeout, a conservative retry policy, and no overlapping execution. Keep it
   disabled until steps 1-4 and offline acceptance are recorded for a new
   target. The current production job is already enabled. The private wrapper
   is intentionally not part of this repository.

6. For activation or re-activation, enable the external command job and observe
   scheduler-owned executions. The current production job is already enabled,
   and its first automatic run succeeded. Record each run time, client
   exit status, and sanitized status and counts output. A `status=200` line
   proves that one authorized call completed; repeated successful scheduled
   runs are required before claiming ongoing cleanup. Never probe production
   with a guessed token: an authorized POST is mutating and there is no dry-run
   mode.

## Failure and deactivation

- Treat 401 as a route/secret/wrapper mismatch and 404 as a deployment
  mismatch. A 403 can be returned by Cloudflare before the Worker receives the
  request, so it alone does not prove a route or secret mismatch; ensure the
  job invokes this checked-in client, which sends the explicit
  `beanfit-retention/0.4.2` User-Agent instead of Python urllib's default. Treat
  any non-2xx client or scheduled result as an operational failure requiring
  attention.
- A 200 with zero counts is a valid no-op, not proof that future invocations
  will run.
- To stop cleanup, pause the bean-sched job first, then rotate or remove the
  deployed secret through platform secret management. Confirm from deployment
  inventory that the secret is absent; an unauthenticated 401 alone cannot
  distinguish an absent secret from a present one.
- Do not add an app-local fallback schedule or delete D1 rows manually. Manual
  deletion bypasses the policy, race checks, child ordering, and audit path.

Do not advertise “all stale data is deleted,” a fixed deletion SLA, or a
retention guarantee unless the deployed version, secret binding, external
schedule, and repeated observed scheduler-owned runs are all verified for
that environment.
