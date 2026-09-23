// Retention cleanup CORE for stale, unclaimed pairing records.
//
// INERT BY DESIGN. Nothing in this app calls this module on a schedule, and
// nothing ever should: the Bean one-clock rule means bean-sched owns ALL
// recurring scheduling. There is deliberately no Cloudflare `scheduled`
// handler, no wrangler cron trigger, and no HTTP route here. Until a later
// bean-sched job invokes `cleanupStalePairing`, NO retention guarantee is
// live — the rows below accumulate exactly as before.
//
// Policy (this worktree): a device row with status 'pending' or 'denied' may
// be deleted once pair_expires_at is at least 24 hours old. 'approved' and
// 'revoked' rows are NEVER touched. Rows with a NULL pair_expires_at have no
// measurable age and are conservatively never eligible.
//
// Safety properties:
//   * bounded — one invocation considers at most CLEANUP_MAX_ROWS candidates
//     (hard cap; the caller may request fewer, never more);
//   * idempotent — a re-run over an already-clean table finds nothing and
//     issues no DELETEs;
//   * parameterized — current time and limit are bound as `?` parameters;
//     no epoch or cutoff is ever interpolated into SQL text;
//   * race-safe — the candidate SELECT is advisory only; every DELETE
//     re-asserts the full eligibility predicate, and child rows are only
//     removed while their device still matches it (children and device stay
//     in lockstep even under a concurrent writer);
//   * FK-safe — D1 batch is one transaction; recommendations and
//     outbound_updates children are deleted before their devices;
//   * credential-safe — the SELECT fetches only `id`, the summary returned
//     is counts only, and this module never logs (no console calls at all),
//     so token/claim hashes can never leak into worker logs.

export const PAIR_RETENTION_GRACE_SECONDS = 24 * 60 * 60; // 86400
export const CLEANUP_MAX_ROWS = 100;

// The one eligibility rule, shared verbatim by the SELECT and every DELETE.
// "at least 24 hours old" is inclusive: pair_expires_at == cutoff is stale.
const STILL_STALE =
  "status IN ('pending', 'denied') AND pair_expires_at IS NOT NULL AND pair_expires_at <= ?";

export function stalePairingCutoff(nowUnix) {
  return Math.floor(nowUnix) - PAIR_RETENTION_GRACE_SECONDS;
}

export async function cleanupStalePairing(db, options = {}) {
  const now = Number.isFinite(options.nowUnix)
    ? Math.floor(options.nowUnix)
    : Math.floor(Date.now() / 1000);
  const requested = Number.isFinite(options.limit)
    ? Math.floor(options.limit)
    : CLEANUP_MAX_ROWS;
  const limit = Math.min(CLEANUP_MAX_ROWS, Math.max(1, requested));
  const cutoff = stalePairingCutoff(now);

  const empty = {
    cutoff,
    candidates: 0,
    recommendationsDeleted: 0,
    outboxDeleted: 0,
    devicesDeleted: 0,
  };

  const { results } = await db.prepare(
    "SELECT id FROM devices WHERE " + STILL_STALE +
    " ORDER BY pair_expires_at, id LIMIT ?"
  ).bind(cutoff, limit).all();

  const ids = (results ?? []).map((row) => row?.id).filter((id) => id != null);
  if (ids.length === 0) return empty;

  const marks = ids.map(() => "?").join(", ");
  // Child guard re-checks the device row: recommendations/outbox rows are
  // only eligible while their device is still stale-eligible, so a device
  // that (hypothetically) flipped status under us loses neither its children
  // nor its own row — both DELETEs skip together.
  const childGuard =
    "device_id IN (SELECT id FROM devices WHERE " + STILL_STALE + ")";

  const batch = await db.batch([
    db.prepare(
      "DELETE FROM recommendations WHERE " + childGuard + " AND device_id IN (" + marks + ")"
    ).bind(cutoff, ...ids),
    db.prepare(
      "DELETE FROM outbound_updates WHERE " + childGuard + " AND device_id IN (" + marks + ")"
    ).bind(cutoff, ...ids),
    db.prepare(
      "DELETE FROM devices WHERE " + STILL_STALE + " AND id IN (" + marks + ")"
    ).bind(cutoff, ...ids),
  ]);

  const changes = (i) => batch?.[i]?.meta?.changes ?? 0;
  return {
    cutoff,
    candidates: ids.length,
    recommendationsDeleted: changes(0),
    outboxDeleted: changes(1),
    devicesDeleted: changes(2),
  };
}
