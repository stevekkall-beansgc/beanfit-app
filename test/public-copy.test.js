import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { landing } from "../src/pages.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = "Hardware detection runs locally. Pairing transmits the sanitized hardware profile and any supplied recommendation snapshot to this app, which stores them as a pending record before you approve it. Approval links that pending record to your account.";

function visibleText(markup) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("public pairing copy states that profile and recommendations are stored before approval", () => {
  assert.ok(visibleText(landing()).includes(expected));
  assert.ok(visibleText(readFileSync(path.join(repoRoot, "README.md"), "utf8")).includes(expected));
  assert.doesNotMatch(landing(), /approve pairing — nothing else/i);
});
