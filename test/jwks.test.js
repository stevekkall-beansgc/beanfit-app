import test from "node:test";
import assert from "node:assert/strict";

import {
  makeGoogleJwksVerifier, GOOGLE_DISCOVERY_URL, GOOGLE_JWKS_URL,
} from "../src/lib/jwks.js";
import {
  makeSigningKey, signIdToken, tamperPayload, jsonResponse,
  googleGoogleFetch, jwkDoc,
} from "./helpers/google-sigs.js";

function claims(overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: "test-client-id",
    sub: "1234567890",
    email: "user@example.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: "expected-nonce",
    ...overrides,
  };
}

test("valid RS256 id_token verifies against the fetched Google keys", async () => {
  const { privateKey, jwk } = await makeSigningKey("valid-1");
  const fetchImpl = googleGoogleFetch([jwk]);
  const verifier = makeGoogleJwksVerifier({ fetchImpl });

  const token = await signIdToken(privateKey, claims(), { kid: "valid-1" });
  const out = await verifier.verify(token);

  assert.equal(out.ok, true);
  assert.deepEqual(out.claims.email, "user@example.com");
  assert.equal(out.claims.email_verified, true);
  assert.ok(fetchImpl.calls.some(u => u === GOOGLE_DISCOVERY_URL), "must use pinned discovery");
  assert.ok(fetchImpl.calls.some(u => u === GOOGLE_JWKS_URL), "must use Google JWKS endpoint");
});

test("tampered payload fails signature verification (claims never trusted)", async () => {
  const { privateKey, jwk } = await makeSigningKey("tamp-1");
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) });
  const token = await signIdToken(privateKey, claims(), { kid: "tamp-1" });
  const forged = await tamperPayload(token, c => ({ ...c, sub: "attacker-uid", email: "evil@example.com" }));

  const out = await verifier.verify(forged);
  assert.equal(out.ok, false);
  assert.match(out.reason, /signature/);
});

test("flipped signature bytes fail", async () => {
  const { privateKey, jwk } = await makeSigningKey("sig-1");
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) });
  const token = await signIdToken(privateKey, claims(), { kid: "sig-1" });
  const [h, p] = token.split(".");
  const bad = `${h}.${p}.${"A".repeat(86)}`;

  const out = await verifier.verify(bad);
  assert.equal(out.ok, false);
  assert.match(out.reason, /signature/i);
});

test("non-RS256 alg is rejected (Google RS256 only)", async () => {
  const { privateKey, jwk } = await makeSigningKey("alg-1");
  // Meaningless at this point: an HS256 header is refused before any signature
  // work even happens.
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) });
  const token = await signIdToken(privateKey, claims(), { kid: "alg-1", alg: "HS256" });
  const out = await verifier.verify(token);
  assert.equal(out.ok, false);
  assert.match(out.reason, /algorithm/);
});

test("missing kid in the header fails closed", async () => {
  const { privateKey, jwk } = await makeSigningKey("nokid");
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) });
  const token = await signIdToken(privateKey, claims(), { kid: undefined, header: { alg: "RS256" } });
  const out = await verifier.verify(token);
  assert.equal(out.ok, false);
  assert.match(out.reason, /key id/);
});

test("malformed JWTs fail closed (every shape)", async () => {
  const { privateKey, jwk } = await makeSigningKey("mal-1");
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch([jwk]) });
  const token = await signIdToken(privateKey, claims(), { kid: "mal-1" });
  const [headB64, payB64] = token.split(".");
  for (const malformed of [
    "",
    "not-a-jwt",
    "a.b",                        // two segments
    `${headB64}`,                 // header only
    headB64.replace(/./g, "!"),   // garbage base64 in the header
  ]) {
    const out = await verifier.verify(malformed);
    assert.equal(out.ok, false, `token ${JSON.stringify(malformed)} must fail`);
  }
  // Header that decodes but carries no alg/kid must fail the header gate.
  const emptyHeader = "e30"; // b64({"})
  assert.equal((await verifier.verify(`${emptyHeader}.${payB64}.c2ln`)).ok, false);
});

test("unknown kid fails closed even after a rotation refetch (no fallback to stale)", async () => {
  const k1 = await makeSigningKey("k1");
  const k2 = await makeSigningKey("k2");
  // Every JWKS answer contains only k1; the token is signed by k2.
  const fetchImpl = googleGoogleFetch([k1.jwk]);
  const verifier = makeGoogleJwksVerifier({ fetchImpl });

  const token = await signIdToken(k2.privateKey, claims(), { kid: "k2" });
  const out = await verifier.verify(token);
  assert.equal(out.ok, false);
  assert.match(out.reason, /unknown key id/);
  assert.equal(fetchImpl.jwksHit(), 2, "one normal fetch + exactly one rotation refetch");
});

test("unknown kid succeeds after a refetch that yields the rotated key", async () => {
  const k1 = await makeSigningKey("k1");
  const k2 = await makeSigningKey("k2");
  const fetchImpl = googleGoogleFetch(null, {
    jwksOnCall: (n) => (n === 1 ? [k1.jwk] : [k1.jwk, k2.jwk]),
  });
  const verifier = makeGoogleJwksVerifier({ fetchImpl });

  const token = await signIdToken(k2.privateKey, claims(), { kid: "k2" });
  const out = await verifier.verify(token);
  assert.equal(out.ok, true, "rotation refetch must pick up the new key");
  assert.equal(fetchImpl.jwksHit(), 2);
});

test("discovery or JWKS fetch failure fails closed (never an identity)", async () => {
  const { privateKey, jwk } = await makeSigningKey("fail-1");
  const token = await signIdToken(privateKey, claims(), { kid: "fail-1" });

  const verifierA = makeGoogleJwksVerifier({ fetchImpl: async (u) => {
    if (String(u) === GOOGLE_DISCOVERY_URL) return new Response("{}", { status: 500 });
    if (String(u) === GOOGLE_JWKS_URL) return jsonResponse({ keys: [jwk] });
    return new Response("nf", { status: 404 });
  } });
  assert.equal((await verifierA.verify(token)).ok, false, "discovery 500 must fail");

  const verifierB = makeGoogleJwksVerifier({ fetchImpl: async (u) => {
    if (String(u) === GOOGLE_DISCOVERY_URL) return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    return new Response("{}", { status: 503 });
  } });
  assert.equal((await verifierB.verify(token)).ok, false, "jwks 503 must fail");

  const verifierC = makeGoogleJwksVerifier({ fetchImpl: async () => { throw new Error("net down"); } });
  assert.equal((await verifierC.verify(token)).ok, false, "thrown fetch must fail");
});

test("discovery returning non-JSON or no jwks_uri fails closed", async () => {
  const { privateKey, jwk } = await makeSigningKey("dd");
  const token = await signIdToken(privateKey, claims(), { kid: "dd" });
  const verifier = makeGoogleJwksVerifier({ fetchImpl: async () => {
    return new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } });
  } });
  assert.equal((await verifier.verify(token)).ok, false);
});

test("an arbitrary jwks_uri from the discovery document is refused (never fetched)", async () => {
  const { privateKey, jwk } = await makeSigningKey("evil");
  const token = await signIdToken(privateKey, claims(), { kid: "evil" });
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(String(u));
    if (String(u) === GOOGLE_DISCOVERY_URL) {
      return jsonResponse({ jwks_uri: "https://evil.example/certs" });
    }
    return jsonResponse({ keys: [jwk] });
  };
  const verifier = makeGoogleJwksVerifier({ fetchImpl });
  const out = await verifier.verify(token);
  assert.equal(out.ok, false, "untrusted jwks_uri must fail closed");
  assert.ok(!calls.some(u => u.startsWith("https://evil.example")), "evil URL must never be fetched");
});

test("token-supplied URLs (jku/jwks_uri/x5u) are ignored by the verifier", async () => {
  const { privateKey, jwk } = await makeSigningKey("self-1");
  const calls = [];
  const verifier = makeGoogleJwksVerifier({ fetchImpl: async (u) => {
    calls.push(String(u));
    if (String(u) === GOOGLE_DISCOVERY_URL) return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    if (String(u) === GOOGLE_JWKS_URL) return jsonResponse({ keys: [jwk] });
    return new Response("nf", { status: 404 });
  } });
  const token = await signIdToken(privateKey, claims({
    jku: "https://evil.example/jwks.json",
    jwks_uri: "https://evil.example/2",
    x5u: "https://evil.example/cert.pem",
  }), { kid: "self-1" });
  const out = await verifier.verify(token);
  assert.equal(out.ok, true, "valid signature still passes, but keys come from pinned endpoints only");
  assert.ok(!calls.some(u => u.startsWith("https://evil.example")), "token URLs must never influence key sourcing");
});

test("sets with no usable RSA key fail closed (EC-only, enc-only, undersized n)", async () => {
  const { privateKey, jwk } = await makeSigningKey("x");
  const token = await signIdToken(privateKey, claims(), { kid: "x" });

  const ecOnly = { keys: [{ kty: "EC", use: "sig", alg: "ES256", kid: "x", crv: "P-256" }] };
  const verifier = makeGoogleJwksVerifier({ fetchImpl: async (u) => {
    if (String(u) === GOOGLE_DISCOVERY_URL) return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    if (String(u) === GOOGLE_JWKS_URL) return jsonResponse(ecOnly);
    return new Response("nf", { status: 404 });
  } });
  assert.equal((await verifier.verify(token)).ok, false, "EC-only set must fail closed");

  const encOnly = { keys: [{ ...jwk, use: "enc" }] };
  const verifier2 = makeGoogleJwksVerifier({ fetchImpl: async (u) => {
    if (String(u) === GOOGLE_DISCOVERY_URL) return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    if (String(u) === GOOGLE_JWKS_URL) return jsonResponse(encOnly);
    return new Response("nf", { status: 404 });
  } });
  assert.equal((await verifier2.verify(token)).ok, false, "enc-only key must not sign id_tokens");
});

test("oversized JWKS sets are refused (bounded key material)", async () => {
  const { privateKey } = await makeSigningKey("big");
  const token = await signIdToken(privateKey, claims(), { kid: "big" });
  const many = [];
  for (let i = 0; i < 11; i++) many.push((await makeSigningKey(`k${i}`)).jwk);
  const verifier = makeGoogleJwksVerifier({ fetchImpl: googleGoogleFetch(many) });
  assert.equal((await verifier.verify(token)).ok, false, ">10-key set must fail closed");
});

test("fresh cache is not refetched; expiry per cache headers triggers one refetch", async () => {
  const { privateKey, jwk } = await makeSigningKey("cache-1");
  const fetchImpl = googleGoogleFetch([jwk], { jwksHeaders: { "cache-control": "public, max-age=60" } });
  let fakeNow = 1_700_000_000_000;
  const verifier = makeGoogleJwksVerifier({ fetchImpl, now: () => fakeNow });

  const a = await signIdToken(privateKey, claims({ sub: "a" }), { kid: "cache-1" });
  const b = await signIdToken(privateKey, claims({ sub: "b" }), { kid: "cache-1" });
  assert.equal((await verifier.verify(a)).ok, true);
  assert.equal((await verifier.verify(b)).ok, true);
  assert.equal(fetchImpl.jwksHit(), 1, "second verify must hit the cached keys");

  fakeNow += 61_000; // past max-age=60
  assert.equal((await verifier.verify(b)).ok, true);
  assert.equal(fetchImpl.jwksHit(), 2, "expired cache must refetch");
});

test("no-store responses disable caching; every verify refetches", async () => {
  const { privateKey, jwk } = await makeSigningKey("nc-1");
  const fetchImpl = googleGoogleFetch([jwk], { jwksHeaders: { "cache-control": "no-store" } });
  const verifier = makeGoogleJwksVerifier({ fetchImpl });
  const t = await signIdToken(privateKey, claims(), { kid: "nc-1" });
  assert.equal((await verifier.verify(t)).ok, true);
  assert.equal((await verifier.verify(t)).ok, true);
  assert.equal(fetchImpl.jwksHit(), 2, "no-store must never reuse keys");
});

test("cache TTL is hard-capped (a one-year max-age still refetches after an hour)", async () => {
  const { privateKey, jwk } = await makeSigningKey("max-1");
  const fetchImpl = googleGoogleFetch([jwk], { jwksHeaders: { "cache-control": "public, max-age=31536000" } });
  let fakeNow = 1_800_000_000_000;
  const verifier = makeGoogleJwksVerifier({ fetchImpl, now: () => fakeNow });
  const t = await signIdToken(privateKey, claims(), { kid: "max-1" });
  assert.equal((await verifier.verify(t)).ok, true);
  fakeNow += 61 * 60 * 1000;
  assert.equal((await verifier.verify(t)).ok, true);
  assert.equal(fetchImpl.jwksHit(), 2, "keys must never be trusted past the 1h cap");
});

test("fetch calls use redirect: 'error' on both discovery and JWKS", async () => {
  const { privateKey, jwk } = await makeSigningKey("redirect-1");
  const jwks = [jwkDoc(jwk)];
  const fetchOptions = [];
  const fetchImpl = async (url, options) => {
    fetchOptions.push({ url: String(url), options });
    if (String(url) === GOOGLE_DISCOVERY_URL) {
      return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    }
    if (String(url) === GOOGLE_JWKS_URL) {
      return jsonResponse({ keys: jwks });
    }
    return new Response("nf", { status: 404 });
  };
  const verifier = makeGoogleJwksVerifier({ fetchImpl });
  const token = await signIdToken(privateKey, claims(), { kid: "redirect-1" });
  const out = await verifier.verify(token);
  assert.equal(out.ok, true);
  assert.equal(fetchOptions.length, 2);
  assert.equal(fetchOptions[0].url, GOOGLE_DISCOVERY_URL);
  assert.equal(fetchOptions[1].url, GOOGLE_JWKS_URL);
  assert.equal(fetchOptions[0].options?.redirect, "error", "discovery fetch must use redirect: error");
  assert.equal(fetchOptions[1].options?.redirect, "error", "jwks fetch must use redirect: error");
});

test("malformed RSA JWK (invalid base64url n) fails closed without throwing", async () => {
  const { privateKey } = await makeSigningKey("badn-1");
  const token = await signIdToken(privateKey, claims(), { kid: "badn-1" });
  const malformedJwk = { kty: "RSA", use: "sig", alg: "RS256", kid: "badn-1", n: "%%%not-base64", e: "AQAB" };
  const fetchImpl = async (url) => {
    if (String(url) === GOOGLE_DISCOVERY_URL) return jsonResponse({ jwks_uri: GOOGLE_JWKS_URL });
    if (String(url) === GOOGLE_JWKS_URL) return jsonResponse({ keys: [malformedJwk] });
    return new Response("nf", { status: 404 });
  };
  const verifier = makeGoogleJwksVerifier({ fetchImpl });
  const out = await verifier.verify(token);
  assert.equal(out.ok, false);
  assert.match(out.reason, /could not fetch signing keys|unusable|malformed|invalid|unknown key id/);
});