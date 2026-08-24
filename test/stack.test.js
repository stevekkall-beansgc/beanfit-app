import test from "node:test";
import assert from "node:assert/strict";

import { generateStack, INTERFACES, modelChoices } from "../src/lib/stack.js";
import { fits } from "../src/lib/fit.js";

const MAC = { model_budget_gib: 96, mem_bandwidth_gbs: 600 };
const SMALL = { model_budget_gib: 8, mem_bandwidth_gbs: 100 };

test("terminal stack: pull + run steps, no files", () => {
  const s = generateStack(MAC, { interface: "terminal", model_tag: "gemma4:31b" });
  assert.equal(s.interface, "terminal");
  assert.equal(s.files.length, 0);
  const codes = s.steps.filter(x => x.code).map(x => x.code);
  assert.ok(codes.includes("ollama pull gemma4:31b"));
  assert.ok(codes.includes("ollama run gemma4:31b"));
  assert.equal(s.warnings.length, 0);
});

test("webui stack: emits compose wired to host ollama", () => {
  const s = generateStack(MAC, { interface: "webui", model_tag: "gpt-oss:20b" });
  const compose = s.files.find(f => f.name === "docker-compose.yml");
  assert.ok(compose);
  assert.match(compose.content, /ghcr\.io\/open-webui\/open-webui:main/);
  assert.match(compose.content, /OLLAMA_BASE_URL=http:\/\/host\.docker\.internal:11434/);
  assert.ok(s.steps.some(x => /docker compose up -d/.test(x.code ?? "")));
});

test("override that won't fit is honored but warned", () => {
  const s = generateStack(SMALL, { interface: "terminal", model_tag: "kimi-k2.6" });
  assert.equal(s.model_tag, "kimi-k2.6"); // user's choice wins
  assert.ok(s.warnings.some(w => /more memory/.test(w)));
  // and the warning is truthful per the fit math
  assert.equal(fits({ mem_q4: 640, mem_q8: 700, kv32k: 6 }, SMALL).fits, false);
});

test("unknown choices fall back to safe defaults", () => {
  const s = generateStack(MAC, { interface: "hologram", model_tag: "skynet" });
  assert.equal(s.interface, "terminal");
  assert.equal(s.model_tag, "gemma4:31b");
});

test("browser-estimate profiles warn about unmeasured memory", () => {
  const est = { model_budget_gib: null, mem_bandwidth_gbs: null };
  const s = generateStack(est, { interface: "terminal", model_tag: "gemma4:31b" });
  assert.ok(s.warnings.some(w => /exact memory/.test(w)));
});

test("model choices exclude nothing (override is the point) and interfaces are stable", () => {
  assert.ok(modelChoices().length >= 8);
  assert.equal(INTERFACES.webui.requiresDocker, true);
  assert.equal(INTERFACES.terminal.requiresDocker, false);
});
