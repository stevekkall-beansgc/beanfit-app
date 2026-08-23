import test from "node:test";
import assert from "node:assert/strict";

import {
  mintState, verifyState, claimsFailureReason, claimsToIdentity,
} from "../src/lib/oauth.js";

const SECRET = "unit-test-secret";

test("state round-trips with nonce and path", async () => {
  const { state, nonce } = await mintState(SECRET, "/pair");
  assert.ok(nonce);
  const out = await verifyState(SECRET, state);
  assert.equal(out?.nonce, nonce);
  assert.equal(out.path, "/pair");
});

test("state rejects tampering, garbage, and expiry", async () => {
  const { state } = await mintState(SECRET);
  assert.equal(await verifyState(SECRET, state + "x"), null);       // bad sig
  assert.equal(await verifyState("other-secret", state), null);     // wrong key
  assert.equal(await verifyState(SECRET, "not-a-state"), null);     // malformed
  const expired = await mintState(SECRET, "", -1);                   // already expired
  assert.equal(await verifyState(SECRET, expired), null);
});

test("state drops unsafe redirect paths", async () => {
  for (const evil of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
    const { state } = await mintState(SECRET, evil);
    const out = await verifyState(SECRET, state);
    assert.equal(out.path, "");
  }
});

const CLIENT = "test-client-id";

function claims(overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT,
    sub: "1234567890",
    email: "User@Example.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: "expected-nonce",
    ...overrides,
  };
}

test("valid claims pass and normalize", () => {
  assert.equal(claimsFailureReason(claims(), CLIENT, "expected-nonce"), null);
  const id = claimsToIdentity(claims());
  assert.equal(id.provider, "google");
  assert.equal(id.uid, "1234567890");
  assert.equal(id.email, "user@example.com");
});

test("claims fail on wrong issuer/audience/expiry/nonce/unverified email", () => {
  const nonce = "expected-nonce";
  assert.match(claimsFailureReason(claims({ iss: "https://evil.example" }), CLIENT, nonce), /issuer/);
  assert.match(claimsFailureReason(claims({ aud: "other-client" }), CLIENT, nonce), /audience/);
  assert.match(claimsFailureReason(claims({ exp: 1000 }), CLIENT, nonce), /expired/);
  assert.match(claimsFailureReason(claims({ nonce: "wrong" }), CLIENT, nonce), /nonce/);
  assert.match(
    claimsFailureReason(claims({ email_verified: false }), CLIENT, nonce),
    /not verified/,
  );
});

test("missing nonce in id_token is rejected (regression: nonce must be sent)", () => {
  const noNonce = claims();
  delete noNonce.nonce;
  assert.match(claimsFailureReason(noNonce, CLIENT, "expected-nonce"), /nonce/);
});
