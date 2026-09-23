import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import worker from "../src/index.js";
import { hmacHex } from "../src/lib/crypto.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "rate-limit-unit-secret";
const IP = "203.0.113.42";
const TARGETS = [
  {
    path: "/signup",
    binding: "SIGNUP_RATE_LIMITER",
    body: "email=private@example.com&password=never-parse-this",
    contentType: "application/x-www-form-urlencoded",
    api: false,
  },
  {
    path: "/login",
    binding: "LOGIN_RATE_LIMITER",
    body: "email=private@example.com&password=never-parse-this",
    contentType: "application/x-www-form-urlencoded",
    api: false,
  },
  {
    path: "/api/pair/start",
    binding: "PAIR_START_RATE_LIMITER",
    body: JSON.stringify({ profile: { hardware: "private-profile-marker" } }),
    contentType: "application/json",
    api: true,
  },
];

function recordingDb() {
  const stats = { prepares: 0, batches: 0 };
  return {
    stats,
    db: {
      prepare() {
        stats.prepares += 1;
        return {
          bind() {
            return {
              first: async () => null,
              all: async () => ({ results: [] }),
              run: async () => ({ meta: { changes: 0 } }),
            };
          },
        };
      },
      async batch() {
        stats.batches += 1;
        return [];
      },
    },
  };
}

function baseEnv({ success = true, error = null, result } = {}) {
  const recording = recordingDb();
  const calls = Object.create(null);
  const binding = (name) => ({
    limit: async ({ key }) => {
      calls[name] ??= [];
      calls[name].push(key);
      if (error) throw error;
      return result === undefined ? { success } : result;
    },
  });
  const env = {
    ENVIRONMENT: "production",
    SESSION_SECRET: SECRET,
    DB: recording.db,
    SIGNUP_RATE_LIMITER: binding("SIGNUP_RATE_LIMITER"),
    LOGIN_RATE_LIMITER: binding("LOGIN_RATE_LIMITER"),
    PAIR_START_RATE_LIMITER: binding("PAIR_START_RATE_LIMITER"),
  };
  return { env, calls, stats: recording.stats };
}

function makeRequest(targetPath, {
  method = "POST",
  body,
  contentType,
  ip = IP,
  cookie = "bf_session=session-that-must-not-be-looked-up",
  headers = {},
  origin = "https://app.example",
} = {}) {
  const requestHeaders = new Headers(headers);
  if (contentType) requestHeaders.set("content-type", contentType);
  if (cookie) requestHeaders.set("cookie", cookie);
  if (ip !== null) requestHeaders.set("CF-Connecting-IP", ip);
  return new Request(`${origin}${targetPath}`, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body }),
  });
}

function assertLimitedResponse(response, status, api) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  if (api) assert.equal(response.headers.get("content-type"), "application/json");
  else assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
}

test("wrangler config declares the three exact unique rate-limit bindings", () => {
  const config = JSON.parse(readFileSync(path.join(repoRoot, "wrangler.jsonc"), "utf8"));
  assert.equal(config.vars.ENVIRONMENT, "production");
  assert.deepEqual(config.ratelimits, [
    {
      name: "SIGNUP_RATE_LIMITER",
      namespace_id: "2026092301",
      simple: { limit: 5, period: 60 },
    },
    {
      name: "LOGIN_RATE_LIMITER",
      namespace_id: "2026092302",
      simple: { limit: 10, period: 60 },
    },
    {
      name: "PAIR_START_RATE_LIMITER",
      namespace_id: "2026092303",
      simple: { limit: 10, period: 60 },
    },
  ]);
  assert.equal(new Set(config.ratelimits.map((item) => item.namespace_id)).size, 3);
  assert.equal(config.triggers, undefined);
});

test("only the three exact POST routes consult rate-limit bindings", async () => {
  const otherPosts = [
    "/logout",
    "/auth/google/link",
    "/devices/d1/revoke",
    "/api/devices/d1/stack",
    "/pair/ABCD2345/approve",
    "/pair/ABCD2345/deny",
    "/api/maintenance/retention-cleanup",
  ];
  for (const targetPath of otherPosts) {
    const state = baseEnv({ success: false });
    const request = makeRequest(targetPath, {
      body: "csrf=x",
      contentType: "application/x-www-form-urlencoded",
      cookie: null,
    });
    const response = await worker.fetch(request, state.env);
    assert.ok(response.status !== 429 && response.status !== 503, targetPath);
    assert.equal(Object.keys(state.calls).length, 0, targetPath);
  }

  for (const target of TARGETS) {
    const state = baseEnv({ success: false });
    const response = await worker.fetch(
      makeRequest(target.path, { method: "GET" }), state.env,
    );
    assert.ok(response.status !== 429 && response.status !== 503, `${target.path} GET`);
    assert.equal(Object.keys(state.calls).length, 0, target.path);

    const putState = baseEnv({ success: false });
    const putResponse = await worker.fetch(
      makeRequest(target.path, { method: "PUT", contentType: target.contentType }), putState.env,
    );
    assert.equal(putResponse.status, 404);
    assert.equal(Object.keys(putState.calls).length, 0, `${target.path} PUT`);
  }
});

test("each target passes a deterministic route-scoped HMAC key with no request data", async () => {
  const keys = [];
  for (const target of TARGETS) {
    const state = baseEnv({ success: false });
    const response = await worker.fetch(
      makeRequest(target.path, { body: target.body, contentType: target.contentType }), state.env,
    );
    assertLimitedResponse(response, 429, target.api);
    const key = state.calls[target.binding][0];
    assert.equal(key, await hmacHex(SECRET, `rate-limit:${target.binding}:${IP}`));
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(key, new RegExp(IP));
    assert.doesNotMatch(key, /private@example\.com|private-profile-marker/);
    keys.push(key);
  }
  assert.equal(new Set(keys).size, 3);

  const source = readFileSync(path.join(repoRoot, "src", "lib", "rate-limit.js"), "utf8");
  assert.doesNotMatch(source, /console\./);
});

test("over-limit responses are 429 with retry headers and route-appropriate bodies", async () => {
  for (const target of TARGETS) {
    const state = baseEnv({ success: false });
    const response = await worker.fetch(
      makeRequest(target.path, { body: target.body, contentType: target.contentType }), state.env,
    );
    assertLimitedResponse(response, 429, target.api);
    const body = await response.text();
    assert.doesNotMatch(body, new RegExp(IP));
    assert.doesNotMatch(body, /private@example\.com|private-profile-marker/);
    if (target.api) assert.deepEqual(JSON.parse(body), { error: "rate_limit_exceeded" });
    else assert.match(body, /Too many requests/);
  }
});

test("an allowed binding decision continues to the scoped route handler", async () => {
  const state = baseEnv();
  const request = makeRequest("/signup", {
    body: "email=bad",
    contentType: "application/x-www-form-urlencoded",
    cookie: null,
  });
  const response = await worker.fetch(request, state.env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Enter a valid email address/);
  assert.equal(state.calls.SIGNUP_RATE_LIMITER.length, 1);
  assert.equal(request.bodyUsed, true);
});

test("production fails closed with 503 for missing dependencies or invalid binding results", async () => {
  const scenarios = [
    ["missing binding", (state, requestOptions) => {
      delete state.env.PAIR_START_RATE_LIMITER;
      return requestOptions;
    }],
    ["missing SESSION_SECRET", (state, requestOptions) => {
      delete state.env.SESSION_SECRET;
      return requestOptions;
    }],
    ["missing CF-Connecting-IP", (state, requestOptions) => ({
      ...requestOptions,
      ip: null,
    })],
    ["binding error", (state, requestOptions) => {
      state.env.PAIR_START_RATE_LIMITER.limit = async () => { throw new Error("binding failed"); };
      return requestOptions;
    }],
    ["invalid binding result", (state, requestOptions) => {
      state.env.PAIR_START_RATE_LIMITER.limit = async () => ({ success: "yes" });
      return requestOptions;
    }],
  ];

  for (const [label, configure] of scenarios) {
    const state = baseEnv();
    const target = TARGETS[2];
    const requestOptions = configure(state, {
      body: target.body,
      contentType: target.contentType,
    });
    const request = makeRequest(target.path, requestOptions);
    const response = await worker.fetch(request, state.env);
    assertLimitedResponse(response, 503, true);
    assert.equal(request.bodyUsed, false, `${label} must not consume the body`);
    assert.equal(state.stats.prepares, 0, `${label} must not query D1`);
    assert.equal(state.stats.batches, 0, `${label} must not batch D1 writes`);
    assert.deepEqual(await response.json(), { error: "rate_limit_unavailable" }, label);
  }

  const htmlState = baseEnv();
  delete htmlState.env.SIGNUP_RATE_LIMITER;
  const htmlResponse = await worker.fetch(
    makeRequest("/signup", {
      body: TARGETS[0].body,
      contentType: TARGETS[0].contentType,
    }),
    htmlState.env,
  );
  assertLimitedResponse(htmlResponse, 503, false);
  assert.match(await htmlResponse.text(), /temporarily unavailable/);
});

test("rejection precedes request-body consumption, session lookup, and all D1 work", async () => {
  for (const target of TARGETS) {
    const state = baseEnv({ success: false });
    const request = makeRequest(target.path, { body: target.body, contentType: target.contentType });
    const response = await worker.fetch(request, state.env);
    assertLimitedResponse(response, 429, target.api);
    assert.equal(request.bodyUsed, false, `${target.path} request body must remain unread`);
    assert.equal(state.stats.prepares, 0, `${target.path} must not query D1`);
    assert.equal(state.stats.batches, 0, `${target.path} must not batch D1 writes`);
  }
});

test("only explicit deployment mode enables the local bypass", async () => {
  const production = baseEnv();
  delete production.env.SIGNUP_RATE_LIMITER;
  const spoofed = await worker.fetch(
    makeRequest("/signup", {
      body: "email=bad",
      contentType: "application/x-www-form-urlencoded",
      cookie: null,
      origin: "http://localhost:8787",
      headers: { "x-environment": "dev", host: "localhost:8787" },
    }),
    production.env,
  );
  assertLimitedResponse(spoofed, 503, false);

  const testMode = baseEnv();
  delete testMode.env.SIGNUP_RATE_LIMITER;
  testMode.env.ENVIRONMENT = "test";
  const testResponse = await worker.fetch(
    makeRequest("/signup", {
      body: "email=bad",
      contentType: "application/x-www-form-urlencoded",
      cookie: null,
    }),
    testMode.env,
  );
  assertLimitedResponse(testResponse, 503, false);

  const recording = recordingDb();
  const localResponse = await worker.fetch(
    makeRequest("/signup", {
      body: "email=bad",
      contentType: "application/x-www-form-urlencoded",
      cookie: null,
      ip: null,
    }),
    { ENVIRONMENT: "dev", DB: recording.db },
  );
  assert.equal(localResponse.status, 200);
  assert.match(await localResponse.text(), /Enter a valid email address/);
  assert.equal(recording.stats.prepares, 0);
});
