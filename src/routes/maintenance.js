// Maintenance endpoints for ops tooling. INERT BY DESIGN: nothing here adds a
// schedule. bean-sched owns ALL recurring scheduling (Bean one-clock rule) and
// may later invoke this endpoint as an external job — but until
// RETENTION_CLEANUP_TOKEN is provisioned the route below fails closed with 401
// (see the "bearer" auth mode in src/index.js), so no retention guarantee is
// live. Do not add a cron/scheduled handler to this module or the app.
//
// This handler invokes the cleanup core in a strictly bounded number of
// batches. cleanupStalePairing caps any single call at CLEANUP_MAX_ROWS (100),
// and this handler runs at most MAINTENANCE_MAX_BATCHES (10) of them, so one
// POST deletes at most 1,000 candidate devices and their children — never an
// unbounded scan. The response is counts only: no row data, no ids, no
// credential material, and this module never logs.

import { json } from "../lib/http.js";
import { cleanupStalePairing, CLEANUP_MAX_ROWS } from "../lib/cleanup.js";

export const MAINTENANCE_MAX_BATCHES = 10;

export function makeMaintenanceHandlers(env) {
  return {
    async retentionCleanup() {
      const summary = {
        batches: 0,
        candidates: 0,
        recommendationsDeleted: 0,
        outboxDeleted: 0,
        devicesDeleted: 0,
      };
      for (let i = 0; i < MAINTENANCE_MAX_BATCHES; i++) {
        const batch = await cleanupStalePairing(env.DB, { limit: CLEANUP_MAX_ROWS });
        summary.batches += 1;
        summary.candidates += batch.candidates;
        summary.recommendationsDeleted += batch.recommendationsDeleted;
        summary.outboxDeleted += batch.outboxDeleted;
        summary.devicesDeleted += batch.devicesDeleted;
        if (batch.candidates < CLEANUP_MAX_ROWS) break;
      }
      return json(summary);
    },
  };
}