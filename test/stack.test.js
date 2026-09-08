import test from "node:test";
import assert from "node:assert/strict";

import {
  generateStack, SURFACES, modelChoices, contextRec,
} from "../src/lib/stack.js";
import { fits } from "../src/lib/fit.js";

const MAC = { model_budget_gib: 96, mem_bandwidth_gbs: 600 };
const SMALL = { model_budget_gib: 8, mem_bandwidth_gbs: 100 };

test("chat-only stack keeps the old guarantees", () => {
  const s = generateStack(MAC, { surfaces: ["chat_terminal"], model_tag: "gemma3:27b" });
  const codes = s.steps.filter(x => x.code).map(x => x.code);
  assert.ok(codes.includes("ollama pull gemma3:27b"));
  assert.ok(codes.includes("ollama run gemma3:27b"));
  assert.equal(s.files.length, 0);
  assert.equal(s.warnings.length, 0);
});

test("webui surface emits compose wired to host ollama", () => {
  const s = generateStack(MAC, { surfaces: ["chat_webui"], model_tag: "gpt-oss:20b" });
  const compose = s.files.find(f => f.name === "docker-compose.yml");
  assert.match(compose.content, /OLLAMA_BASE_URL=http:\/\/host\.docker\.internal:11434/);
  assert.ok(s.steps.some(x => /docker compose up -d/.test(x.code ?? "")));
});

test("opencode surface emits a real provider config", () => {
  const s = generateStack(MAC, { surfaces: ["code_opencode"], model_tag: "qwen3:30b-a3b" });
  const cfg = s.files.find(f => f.name.includes("opencode.jsonc"));
  assert.match(cfg.content, /"ollama"/);
  assert.match(cfg.content, /localhost:11434\/v1/);
  assert.match(cfg.content, /"model": "ollama\/qwen3:30b-a3b"/);
  assert.ok(s.steps.some(x => /opencode\.ai\/install/.test(x.code ?? "")));
});

test("continue surface emits editor config; api surface emits client example", () => {
  const s = generateStack(MAC, { surfaces: ["edit_continue", "api"], model_tag: "gemma3:27b" });
  assert.ok(s.files.find(f => f.name.includes("config.yaml")));
  assert.match(s.files.find(f => f.name === "example.py").content, /localhost:11434\/v1/);
});

test("multi-surface stacks merge steps and files", () => {
  const s = generateStack(MAC, {
    surfaces: ["chat_webui", "code_opencode", "api"], model_tag: "gemma3:27b",
  });
  assert.equal(s.files.length, 3);
  assert.ok(s.surfaces.length === 3);
});

test("override that won't fit is honored but warned", () => {
  const s = generateStack(SMALL, { surfaces: ["chat_terminal"], model_tag: "llama4:scout" });
  assert.equal(s.model_tag, "llama4:scout");
  assert.ok(s.warnings.some(w => /more memory/.test(w)));
  assert.equal(fits({ mem_q4: 67, mem_q8: 117, kv32k: 1.5 }, SMALL).fits, false);
});

test("unknown choices fall back to safe defaults", () => {
  const s = generateStack(MAC, { surfaces: ["hologram"], model_tag: "skynet" });
  assert.deepEqual(s.surfaces, ["chat_webui"]);
  assert.equal(s.model_tag, "gemma3:27b");
});

test("context recommendation scales with leftover memory", () => {
  assert.equal(contextRec(MAC, "gemma3:27b"), 131072);
  // 8 GiB budget - 5.2 weights = 2.8 left; at 0.9 GiB/32k that is 96k.
  assert.equal(contextRec({ model_budget_gib: 8 }, "qwen3:8b"), 65536);
  assert.equal(contextRec({ model_budget_gib: 4 }, "llama4:scout"), null);
  assert.ok(generateStack(MAC, { surfaces: ["chat_terminal"], model_tag: "gemma3:27b" })
    .steps.some(x => /OLLAMA_CONTEXT_LENGTH/.test(x.code ?? "")));
});

test("catalog and surfaces stay stable", () => {
  assert.ok(modelChoices().length >= 8);
  assert.equal(SURFACES.chat_webui.requiresDocker, true);
  assert.equal(SURFACES.code_opencode.requiresDocker, false);
});
