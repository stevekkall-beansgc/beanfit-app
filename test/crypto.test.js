import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword, pairingCode, timingSafeEqual, randomHex } from "../src/lib/crypto.js";

test("password hash round-trips", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.match(hash, /^pbkdf2\$100000\$/);
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("verifyPassword survives malformed stored hashes", async () => {
  assert.equal(await verifyPassword("x", "garbage"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

test("pairing codes use unambiguous alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = pairingCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
    assert.doesNotMatch(code, /[ILOU]/);
  }
});

test("timingSafeEqual", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
});

test("randomHex length and uniqueness", () => {
  const a = randomHex(16), b = randomHex(16);
  assert.equal(a.length, 32);
  assert.notEqual(a, b);
});
