import test from "node:test";
import assert from "node:assert/strict";

import {
  mintState, verifyState, claimsFailureReason, claimsToIdentity,
} from "../src/lib/oauth.js";
import { hmacHex } from "../src/lib/crypto.js";

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

test("state carries an explicit link binding and round-trips", async () => {
  const { state, nonce } = await mintState(SECRET, "/dashboard", 600, { uid: "u1", sid: "sid-hash" });
  const out = await verifyState(SECRET, state);
  assert.equal(out?.nonce, nonce);
  assert.deepEqual(out.link, { uid: "u1", sid: "sid-hash" });
});

test("plain sign-in state has no link binding", async () => {
  const { state } = await mintState(SECRET, "/login");
  assert.equal((await verifyState(SECRET, state)).link, null);
});

test("link binding is omitted when the binding is malformed (not half-written)", async () => {
  const { state } = await mintState(SECRET, "", 600, { uid: "", sid: "x" });
  assert.equal((await verifyState(SECRET, state)).link, null);
});

test("a forged link binding with a valid signature fails closed", async () => {
  const payload = Buffer.from(JSON.stringify({ n: "n", x: 9999999999, p: "/dashboard", l: { u: "u1" } })).toString("base64url");
  const forged = `${payload}.${await hmacHex(SECRET, `state:${payload}`)}`;
  const out = await verifyState(SECRET, forged);
  assert.equal(out, null, "partial binding (missing sid) must reject the whole state");
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

test("email_verified must be exactly the boolean true (fail closed otherwise)", () => {
  const nonce = "expected-nonce";
  for (const v of [false, "true", 1, "True", null]) {
    const c = claims({ email_verified: v });
    assert.match(claimsFailureReason(c, CLIENT, nonce), /not verified/, `email_verified=${JSON.stringify(v)} must fail`);
  }
  const absent = claims();
  delete absent.email_verified;
  assert.match(claimsFailureReason(absent, CLIENT, nonce), /not verified/, "absent email_verified must fail");
});

test("subject must be a nonempty string (fail closed otherwise)", () => {
  const nonce = "expected-nonce";
  for (const sub of ["", 0, 123, null]) {
    assert.match(
      claimsFailureReason(claims({ sub }), CLIENT, nonce),
      /subject/,
      `sub=${JSON.stringify(sub)} must fail`,
    );
  }
  const absent = claims();
  delete absent.sub;
  assert.match(claimsFailureReason(absent, CLIENT, nonce), /subject/, "absent sub must fail");
});
