import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/lib/store.js";

test("createStore exposes every repository (regression: identities was missing)", () => {
  const fakeDb = new Proxy({}, {
    get: () => () => ({
      bind: () => ({ run: async () => {}, first: async () => null, all: async () => ({ results: [] }) }),
    }),
  });
  const store = createStore(fakeDb);
  for (const repo of ["users", "sessions", "identities", "devices", "recommendations", "catalog"]) {
    assert.ok(store[repo], `${repo} missing from store`);
  }
  // every method used by routes exists
  for (const fn of ["find", "create"]) {
    assert.equal(typeof store.identities[fn], "function");
  }
});
