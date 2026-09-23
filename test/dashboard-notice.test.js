import test from "node:test";
import assert from "node:assert/strict";

import { makePageHandlers } from "../src/routes/pair.js";

// Dashboard success-notice regression (Task 2): the ?linked=google notice must
// only render when THIS user's Google identity is actually linked — a forged
// query alone must never show a false "Google account linked" confirmation.

function dashDb(identities) {
  return {
    prepare: (sql) => ({
      bind: () => ({
        all: async () => {
          if (sql.includes("FROM user_identities")) return { results: identities };
          return { results: [] }; // devices.listForUser -> empty
        },
        first: async () => null,
        run: async () => ({ meta: { changes: 0 } }),
      }),
    }),
    batch: async () => ({}),
  };
}

async function renderDashboard({ googleLinked, queryLinked }) {
  const identities = googleLinked
    ? [{ provider: "google", provider_uid: "g-1", email_at_link: "me@example.com", created_at: "2026-01-01" }]
    : [];
  const handlers = makePageHandlers(
    { DB: dashDb(identities), GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csec" },
    { csrfFor: async () => "csrf" },
  );
  const query = queryLinked ? new URLSearchParams("linked=google") : new URLSearchParams();
  const res = await handlers.dashboard({
    user: { id: "u1", email: "me@example.com" },
    query,
    request: new Request("https://app.example/dashboard"),
  });
  return res.text();
}

test("?linked=google shows the success notice only when the Google identity is really linked", async () => {
  const linked = await renderDashboard({ googleLinked: true, queryLinked: true });
  assert.match(linked, /class="badge ok">Google account linked\./);
  assert.match(linked, />linked</);

  const forged = await renderDashboard({ googleLinked: false, queryLinked: true });
  assert.doesNotMatch(forged, /Google account linked\./, "forged query must not print a success notice");
  assert.match(forged, /not linked/);
  assert.match(forged, /action="\/auth\/google\/link"/, "unlinked user still sees the link form");
});

test("no ?linked query produces no notice even when the identity is linked", async () => {
  const quiet = await renderDashboard({ googleLinked: true, queryLinked: false });
  assert.doesNotMatch(quiet, /Google account linked\./);
  assert.match(quiet, /class="badge ok">linked/);
});