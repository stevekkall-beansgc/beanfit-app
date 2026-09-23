import test from "node:test";
import assert from "node:assert/strict";

import { makeAuthHandlers } from "../src/routes/auth.js";
import { mintState } from "../src/lib/oauth.js";
import { makeGoogleJwksVerifier } from "../src/lib/jwks.js";
import { randomHex, sha256Hex } from "../src/lib/crypto.js";
import {
  makeSigningKey, signIdToken, tamperPayload, googleGoogleFetch,
} from "./helpers/google-sigs.js";

// Security-fix contract under test (email-match auto-linking removed):
//   * email match alone NEVER links or signs in — the callback fails closed;
//   * explicit linking needs the initiating user's session + CSRF, and the
//     OAuth state is bound to that exact session;
//   * a Google identity already linked to a different user is rejected;
//   * races are resolved by re-reading identity state, never by email;
//   * new signup and known-identity sign-in still work;
//   * the production callback verifies the Google id_token signature BEFORE
//     any claim is trusted or any identity/session work happens.

const NOW = Math.floor(Date.now() / 1000);
const ENV = {
  SESSION_SECRET: "unit-link-secret",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "csec",
  DB: null,
};

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function nonceFromState(state) {
  const payload = state.split(".")[0];
  const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  return JSON.parse(json).n;
}

function memStore() {
  const users = [];
  const ids = [];
  const sessions = [];
  const store = {
    users: {
      byEmail: async (email) => users.find(u => u.email === email) ?? null,
      byId: async (id) => users.find(u => u.id === id) ?? null,
      create: async (id, email, pwHash) => { users.push({ id, email, pw_hash: pwHash }); },
      createWithIdentity: async (user, identity) => {
        if (store._failCreate) throw new Error("UNIQUE");
        if (users.some(u => u.email === user.email)) throw new Error("UNIQUE email");
        if (ids.some(i => i.provider === identity.provider && i.provider_uid === identity.providerUid))
          throw new Error("UNIQUE identity");
        users.push({ id: user.id, email: user.email, pw_hash: user.pwHash });
        ids.push({
          provider: identity.provider, provider_uid: identity.providerUid,
          user_id: identity.userId, email_at_link: identity.emailAtLink,
        });
      },
    },
    identities: {
      find: async (provider, providerUid) =>
        ids.find(i => i.provider === provider && i.provider_uid === providerUid) ?? null,
      create: async (provider, providerUid, userId, emailAtLink) => {
        if (ids.some(i => i.provider === provider && i.provider_uid === providerUid))
          throw new Error("UNIQUE identity");
        ids.push({ provider, provider_uid: providerUid, user_id: userId, email_at_link: emailAtLink });
      },
      byUser: async (userId) => ids.filter(i => i.user_id === userId),
    },
    sessions: {
      create: async (tokenHash, userId, expiresAt) => { sessions.push({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt }); },
      valid: async (tokenHash, now) => {
        const s = sessions.find(x => x.token_hash === tokenHash && x.expires_at > now);
        const u = s && users.find(x => x.id === s.user_id);
        return u ? { user_id: u.id, email: u.email } : null;
      },
      destroy: async (tokenHash) => {
        const i = sessions.findIndex(x => x.token_hash === tokenHash);
        if (i >= 0) sessions.splice(i, 1);
      },
    },
    devices: { listForUser: async () => [] },
    _users: users, _ids: ids, _sessions: sessions,
  };
  return store;
}

function baseClaims(state, overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: ENV.GOOGLE_CLIENT_ID,
    sub: "google-uid-1",
    email: "newperson@example.com",
    email_verified: true,
    exp: NOW + 600,
    nonce: nonceFromState(state),
    ...overrides,
  };
}

function fakeExchange(state, claimsOverrides) {
  return async () => ({
    status: 200,
    body: { id_token: `h.${b64urlJson(baseClaims(state, claimsOverrides))}.sig` },
  });
}

// Mirrors the real JWKS verifier's decision boundary for flow tests: the
// (unsigned) fixture token's claims pass through, and the callback's own
// claimsFailureReason still gates them. Signature correctness itself is
// exercised deterministically in jwks.test.js with real RSA keys.
function stubVerifyToken() {
  return async (idToken) => {
    try {
      const [, payB64] = String(idToken).split(".");
      const claims = JSON.parse(
        Buffer.from(payB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
      return { ok: true, claims };
    } catch {
      return { ok: false, reason: "malformed jwt" };
    }
  };
}

async function loginAs(store, userId) {
  const token = randomHex(32);
  await store.sessions.create(await sha256Hex(token), userId, NOW + 3600);
  return token;
}

function callbackRequest(state, { sessionToken = null, code = "auth-code", withStateCookie = true } = {}) {
  const params = new URLSearchParams({ code });
  params.set("state", state);
  const cookies = [];
  if (withStateCookie) cookies.push(`bf_oauth=${state}`);
  if (sessionToken) cookies.push(`bf_session=${sessionToken}`);
  return new Request(`https://app.example/auth/google/callback?${params}`, {
    headers: { cookie: cookies.join("; ") },
  });
}

async function callbackCtx(state, opts = {}) {
  const request = callbackRequest(state, opts);
  const handlers = makeAuthHandlers(ENV, {
    store: opts.store,
    exchange: opts.exchange ?? fakeExchange(state, opts.claims),
    verifyGoogleToken: opts.verifyGoogleToken ?? stubVerifyToken(),
  });
  const user = opts.sessionToken
    ? await handlers.userFromRequest(request)
    : null;
  return { handlers, ctx: { request, query: new URL(request.url).searchParams, params: {}, form: null, user } };
}

async function startLink(handlers, store, token, userId) {
  const sessionReq = new Request("https://app.example/dashboard", {
    headers: { cookie: `bf_session=${token}` },
  });
  const csrf = await handlers.csrfFor(sessionReq);
  const res = await handlers.googleLinkStart({
    request: new Request("https://app.example/auth/google/link", {
      method: "POST",
      headers: { cookie: `bf_session=${token}`, "content-type": "application/x-www-form-urlencoded" },
    }),
    query: new URLSearchParams(),
    form: { csrf },
    user: { id: userId, email: "me@example.com" },
  });
  assert.equal(res.status, 303, "valid link initiation must redirect to Google");
  return new URL(res.headers.get("location")).searchParams.get("state");
}

test("email match alone does NOT link or sign in (fail closed)", async () => {
  const store = memStore();
  await store.users.create("pw-user", "person@example.com", "pbkdf2hash");
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard");

  const { handlers, ctx } = await callbackCtx(state, {
    store,
    claims: { sub: "google-new-uid", email: "person@example.com" },
  });

  const res = await handlers.googleCallback(ctx);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /email already exists/i);
  assert.match(body, /link Google from your dashboard/i);
  assert.equal(res.headers.get("location"), null, "must not redirect into a session");
  assert.equal(store._ids.length, 0, "no identity may be created by email match");
  assert.equal(store._sessions.length, 0, "no session may be issued by email match");
});

test("signup race that collides on email still refuses to link (fail closed)", async () => {
  const store = memStore();
  let emailLookups = 0;
  store.users.byEmail = async (email) => {
    emailLookups += 1;
    if (emailLookups === 1) return null;             // pre-create check: looks free
    return { id: "racer", email, pw_hash: "x" };     // after create failed: exists
  };
  store._failCreate = true;

  const { state } = await mintState(ENV.SESSION_SECRET, "");
  const { handlers, ctx } = await callbackCtx(state, {
    store,
    claims: { sub: "race-uid", email: "person@example.com" },
  });

  const res = await handlers.googleCallback(ctx);
  const body = await res.text();
  assert.match(body, /email already exists/i);
  assert.equal(store._ids.length, 0, "race must never link via email");
  assert.equal(store._sessions.length, 0);
});

test("new email still signs up a passwordless account (one atomic write)", async () => {
  const store = memStore();
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard");
  const { handlers, ctx } = await callbackCtx(state, {
    store,
    claims: { email: "brand-new@example.com" },
  });

  const res = await handlers.googleCallback(ctx);
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location") ?? "", /\/dashboard/);
  assert.ok(res.headers.get("set-cookie")?.includes("bf_session="));
  assert.equal(store._users.length, 1);
  assert.equal(store._ids.length, 1);
  assert.equal(store._ids[0].user_id, store._users[0].id);
});

test("already-linked Google identity still signs in", async () => {
  const store = memStore();
  await store.users.create("u-linked", "linked@example.com", "pbkdf2hash");
  await store.identities.create("google", "google-uid-1", "u-linked", "linked@example.com");

  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard");
  const { handlers, ctx } = await callbackCtx(state, {
    store,
    claims: { email: "linked@example.com" },
  });

  const res = await handlers.googleCallback(ctx);
  assert.equal(res.status, 303);
  assert.match(res.headers.get("set-cookie") ?? "", /bf_session=/);
  const token = /bf_session=([^;]+)/.exec(res.headers.get("set-cookie"))[1];
  assert.equal((await store.sessions.valid(await sha256Hex(token), NOW)).user_id, "u-linked");
});

test("link initiation requires CSRF, session, and sso configuration", async () => {
  const store = memStore();
  await store.users.create("u1", "me@example.com", "pbkdf2hash");
  const handlers = makeAuthHandlers(ENV, { store, exchange: fakeExchange("x") });
  const token = await loginAs(store, "u1");

  const bad = await handlers.googleLinkStart({
    request: new Request("https://app.example/auth/google/link", {
      method: "POST", headers: { cookie: `bf_session=${token}` },
    }),
    query: new URLSearchParams(), form: {}, user: { id: "u1" },
  });
  assert.equal(bad.status, 400, "missing CSRF must fail");

  const wrong = await handlers.googleLinkStart({
    request: new Request("https://app.example/auth/google/link", { method: "POST" }),
    query: new URLSearchParams(), form: { csrf: "deadbeef" }, user: { id: "u1" },
  });
  assert.equal(wrong.status, 400, "wrong CSRF must fail");

  const none = await handlers.googleLinkStart({
    request: new Request("https://app.example/auth/google/link", { method: "POST" }),
    query: new URLSearchParams(), form: { csrf: "x" }, user: null,
  });
  assert.equal(none.status, 400, "no session must fail closed beyond the route gate");

  const noSso = await makeAuthHandlers(
    { ...ENV, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }, { store, exchange: fakeExchange("x") },
  ).googleLinkStart({
    request: new Request("https://app.example/auth/google/link", { method: "POST" }),
    query: new URLSearchParams(), form: { csrf: "x" }, user: { id: "u1" },
  });
  assert.equal(noSso.status, 503, "unconfigured SSO must fail");

  const ok = await handlers.googleLinkStart({
    request: new Request("https://app.example/auth/google/link", {
      method: "POST",
      headers: { cookie: `bf_session=${token}`, "content-type": "application/x-www-form-urlencoded" },
    }),
    query: new URLSearchParams(), form: { csrf: await handlers.csrfFor(
      new Request("https://app.example/dashboard", { headers: { cookie: `bf_session=${token}` } })) },
    user: { id: "u1", email: "me@example.com" },
  });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get("location") ?? "", /accounts\.google\.com/);
  assert.ok(ok.headers.get("set-cookie")?.includes("bf_oauth="));
});

test("link callback completes only for the exact session that initiated it", async () => {
  const store = memStore();
  await store.users.create("u1", "me@example.com", "pbkdf2hash");
  const token = await loginAs(store, "u1");
  const handlers = makeAuthHandlers(ENV, { store, exchange: fakeExchange("x") });

  const state = await startLink(handlers, store, token, "u1");

  const { handlers: h2, ctx: c2 } = await callbackCtx(state, {
    store, sessionToken: token,
    claims: { email: "me@example.com", sub: "google-uid-1" },
  });
  const res = await h2.googleCallback(c2);
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location") ?? "", /\/dashboard\?linked=google/);
  assert.deepEqual(store._ids.at(-1), {
    provider: "google", provider_uid: "google-uid-1", user_id: "u1", email_at_link: "me@example.com",
  });
});

test("link callback with no session fails closed (no identity, no session)", async () => {
  const store = memStore();
  await store.users.create("u1", "me@example.com", "pbkdf2hash");
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard", 600, { uid: "u1", sid: "hash" });

  const { handlers, ctx } = await callbackCtx(state, {
    store, claims: { email: "me@example.com", sub: "g-new" },
  });
  const res = await handlers.googleCallback(ctx);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /Linking requires your signed-in session/i);
  assert.equal(store._ids.length, 0);
  assert.equal(store._sessions.length, 0);
});

test("link callback with a changed session fails closed (state is session-bound)", async () => {
  const store = memStore();
  await store.users.create("u1", "me@example.com", "pbkdf2hash");
  const other = await loginAs(store, "u1");
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard", 600, {
    uid: "u1", sid: await sha256Hex("the-original-session"),
  });

  const { handlers, ctx } = await callbackCtx(state, {
    store, sessionToken: other, claims: { email: "me@example.com", sub: "g-new" },
  });
  const res = await handlers.googleCallback(ctx);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /session changed/i);
  assert.equal(store._ids.length, 0, "session mismatch must not link");
});

test("link callback rejects a Google identity already linked to another user", async () => {
  const store = memStore();
  await store.users.create("u1", "me@example.com", "pbkdf2hash");
  await store.users.create("u2", "other@example.com", "pbkdf2hash");
  await store.identities.create("google", "shared-google", "u2", "other@example.com");

  const token = await loginAs(store, "u1");
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard", 600, {
    uid: "u1", sid: await sha256Hex(token),
  });
  const { handlers, ctx } = await callbackCtx(state, {
    store, sessionToken: token, claims: { email: "me@example.com", sub: "shared-google" },
  });
  const res = await handlers.googleCallback(ctx);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /already linked to a different account/i);
  assert.equal(store._ids.length, 1, "identity must stay with its existing user");
  assert.equal(store._ids[0].user_id, "u2");
});

test("link race: concurrent link to another user is rejected, same user is accepted", async () => {
  const racedStore = memStore();
  await racedStore.users.create("u1x", "me@example.com", "pbkdf2hash");
  await racedStore.users.create("u2x", "other@example.com", "pbkdf2hash");
  const racedToken = await loginAs(racedStore, "u1x");
  const racedState = await mintState(ENV.SESSION_SECRET, "/dashboard", 600, {
    uid: "u1x", sid: await sha256Hex(racedToken),
  });
  racedStore.identities.create = async () => { throw new Error("UNIQUE"); };
  racedStore.identities.find = async () => ({ user_id: "u2x" });

  const { handlers, ctx } = await callbackCtx(racedState.state, {
    store: racedStore, sessionToken: racedToken, claims: { email: "me@example.com", sub: "race-uid" },
  });
  const reject = await handlers.googleCallback(ctx);
  assert.equal(reject.status, 403);
  assert.match(await reject.text(), /already linked to a different account/i);

  const wonStore = memStore();
  await wonStore.users.create("u1", "me@example.com", "pbkdf2hash");
  const wonToken = await loginAs(wonStore, "u1");
  const wonState = await mintState(ENV.SESSION_SECRET, "/dashboard", 600, {
    uid: "u1", sid: await sha256Hex(wonToken),
  });
  wonStore.identities.create = async () => { throw new Error("UNIQUE"); };
  wonStore.identities.find = async () => ({ user_id: "u1" });

  const { handlers: h2, ctx: c2 } = await callbackCtx(wonState.state, {
    store: wonStore, sessionToken: wonToken, claims: { email: "me@example.com", sub: "race-uid" },
  });
  const ok = await h2.googleCallback(c2);
  assert.equal(ok.status, 303, "racing win for the same bound user is idempotent success");
});

test("sign-in callback rejects unverified and missing-subject Google claims in-app", async () => {
  for (const bad of [
    { email_verified: "true" },
    { email_verified: false },
    { email_verified: undefined },
    { sub: "" },
  ]) {
    const store = memStore();
    const { state } = await mintState(ENV.SESSION_SECRET, "");
    const { handlers, ctx } = await callbackCtx(state, {
      store, claims: { email: "fresh@example.com", ...bad },
    });
    const res = await handlers.googleCallback(ctx);
    const body = await res.text();
    assert.match(body, /failed validation/i, JSON.stringify(bad));
    assert.equal(store._users.length, 0, "no user may be created for rejected claims");
  }
});

test("route gate: POST /auth/google/link without a session redirects to login", async () => {
  const worker = (await import("../src/index.js")).default;
  const res = await worker.fetch(
    new Request("https://app.example/auth/google/link", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "csrf=x",
    }),
    ENV,
  );
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location") ?? "", /\/login\?next=/);

  const notGet = await worker.fetch(new Request("https://app.example/auth/google/link"), ENV);
  assert.equal(notGet.status, 404);
});

test("real signed token flows through the verifier; a forged signature draws NO store work", async () => {
  const { privateKey, jwk } = await makeSigningKey("order-1");
  const realVerify = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) }).verify;
  const { state } = await mintState(ENV.SESSION_SECRET, "/dashboard");
  const goodToken = await signIdToken(
    privateKey, baseClaims(state, { email: "order@example.com", sub: "order-uid" }),
    { kid: "order-1" });

  // Non-random-junk store, but every read/write is recorded in call order.
  function recorded(store, log) {
    for (const repo of Object.keys(store)) {
      if (repo.startsWith("_")) continue;
      for (const name of Object.keys(store[repo])) {
        const fn = store[repo][name];
        store[repo][name] = async (...a) => { log.push(`${repo}.${name}`); return fn(...a); };
      }
    }
    return store;
  }

  // 1. A genuinely signed token: verifier runs FIRST, then identity resolution.
  const store = memStore();
  await store.users.create("u-ord", "order@example.com", "pbkdf2hash");
  await store.identities.create("google", "order-uid", "u-ord", "order@example.com");
  const log = [];
  const { handlers, ctx } = await callbackCtx(state, {
    store: recorded(store, log),
    exchange: async () => ({ status: 200, body: { id_token: goodToken } }),
    verifyGoogleToken: async (t) => { log.push("verify-token"); return realVerify(t); },
  });
  const ok = await handlers.googleCallback(ctx);
  assert.equal(ok.status, 303, "validly signed identity signs in");
  assert.match(ok.headers.get("set-cookie") ?? "", /bf_session=/);
  assert.equal(log[0], "verify-token", "signature verification must come before identity resolution");
  assert.ok(log.slice(1).some(c => c === "identities.find"), "identity lookup happens after the signature gate");

  // 2. Same token, payload rewritten, ORIGINAL signature preserved: rejected
  //    at the signature gate with the store never consulted once.
  const forged = await tamperPayload(goodToken, c => ({ ...c, sub: "attacker-uid", email: "evil@example.com" }));
  const fresh = memStore();
  await fresh.users.create("u-ord", "order@example.com", "pbkdf2hash");
  await fresh.identities.create("google", "order-uid", "u-ord", "order@example.com");
  const badLog = [];
  const { handlers: h2, ctx: c2 } = await callbackCtx(state, {
    store: recorded(fresh, badLog),
    exchange: async () => ({ status: 200, body: { id_token: forged } }),
    verifyGoogleToken: async (t) => { badLog.push("verify-token"); return realVerify(t); },
  });
  const bad = await h2.googleCallback(c2);
  assert.equal(bad.status, 200);
  assert.match(await bad.text(), /failed validation/i);
  assert.equal(bad.headers.get("location"), null, "no session may be minted from a bad signature");
  assert.deepEqual(badLog, ["verify-token"], "a bad signature must fail before ANY store lookup");
});