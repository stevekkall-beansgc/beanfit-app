import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onDeviceCatalog, suggestOnDevice } from "../src/lib/on-device.js";
import { modelSuggestions } from "../src/routes/models.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.env.BEANFIT_SRC ?? path.resolve(here, "../../beanfit/src");
const options = [
  { experience: "text_assistant", device: "iPhone15,3", os_major: 26 },
  { experience: "structured_extraction", device: "iPhone14,7", os_major: 26 },
  { experience: "shopping_filters", device: "iPhone15,3", os_major: 26 },
  { experience: "text_assistant", device: "iPhone15,3", os_major: 26, memory_budget_bytes: 200000000 },
  { experience: "text_assistant", device: "iPhone15,3", os_major: 26, memory_budget_bytes: 153406304 },
  { experience: "text_assistant", device: "iPhone15,3", os_major: 26, preference: "smallest_download" },
  { experience: "text_assistant", device: "unknown", os_major: 26 },
  { experience: "text_assistant", device: "iPhone15,3", os_major: 25 },
  ...["image_description", "transcription", "speech_output", "semantic_search", "decision_classification"].map(experience => ({ experience, device: "iPhone15,3", os_major: 26 })),
];

test("on-device catalog and every suggestion match the CLI", {
  skip: !fs.existsSync(path.join(src, "beanfit/on_device.py")) && "updated BeanFit source required",
}, () => {
  const script = "import json,sys; from beanfit.on_device import catalog,suggest; print(json.dumps({'catalog':catalog(),'results':[suggest(**x) for x in json.load(sys.stdin)]}))";
  const expected = JSON.parse(execFileSync("python3", ["-c", script], {
    env: { ...process.env, PYTHONPATH: src }, input: JSON.stringify(options), encoding: "utf8",
  }));
  assert.deepEqual(onDeviceCatalog, expected.catalog);
  assert.deepEqual(options.map(suggestOnDevice), expected.results);
});

test("failed shopping models and unsupported runtimes never enter the trial order", () => {
  const shopping = suggestOnDevice(options[2]);
  assert.ok(!shopping.trial_order.includes("liquid350"));
  assert.ok(!shopping.trial_order.includes("qwen08"));
  assert.equal(shopping.selection, null);
  const vision = suggestOnDevice({ ...options[0], experience: "image_description" });
  assert.deepEqual(vision.trial_order, []);
  assert.equal(vision.candidates[0].status, "requires_runtime_integration");
  assert.equal(vision.candidates[0].artifacts.length, 2);
  assert.equal(vision.candidates[0].download_bytes, 332128736);
});

test("unknown inputs and invalid budgets fail closed", () => {
  for (const input of [{experience:"<script>"}, {os_major:true}, {memory_budget_bytes:NaN},
    {memory_budget_bytes:0}, {memory_budget_bytes:true}, {context_tokens:2049}]) {
    assert.throws(() => suggestOnDevice(input));
  }
});

test("voice notes and search retain integration gates and exclude Mac references", async () => {
  assert.deepEqual(onDeviceCatalog.experiences.slice(0, 3).map(e => e.id),
    ["text_assistant", "transcription", "semantic_search"]);
  for (const [experience, first] of [["transcription", "fluid_speech_mini"], ["semantic_search", "embeddinggemma300"]]) {
    const query = new URLSearchParams({ device: "iPhone15,3", ios: "26", experience });
    const result = await modelSuggestions({ query, user: null }, true).json();
    assert.equal(result.candidates[0].id, first);
    assert.deepEqual(result.trial_order, []);
    assert.equal(result.selection, null);
    assert.ok(result.candidates.every(m => m.status === "requires_runtime_integration" && m.memory_fit === "unknown"));
    const page = await modelSuggestions({ query, user: null }).text();
    assert.match(page, /Start with text, voice notes and search/);
    assert.match(page, /Needs additional app support/);
    assert.match(page, /Mac comparison models/);
  }
  const references = new Set(onDeviceCatalog.reference_models.map(m => m.id));
  for (const task of onDeviceCatalog.experiences) {
    assert.ok(suggestOnDevice({ experience: task.id, device: "iPhone15,3", os_major: 26 })
      .candidates.every(m => !references.has(m.id)));
  }
});

test("public suggestions route exposes candidates without a fit guarantee", async () => {
  const query = new URLSearchParams({device:"iPhone15,3",ios:"26",experience:"shopping_filters"});
  const api = modelSuggestions({query,user:null}, true);
  assert.equal(api.status, 200);
  const result = await api.json();
  assert.equal(result.selection, null);
  assert.ok(!result.trial_order.includes("liquid350"));
  const page = await modelSuggestions({query,user:null}).text();
  assert.match(page, /no configuration here is production-qualified/);
  assert.match(page, /Failed existing shopping tests/);
  assert.match(page, /LFM2.5 1.2B/);
  assert.doesNotMatch(page, /Runs great/);
  const bad = modelSuggestions({query:new URLSearchParams({device:'<img src=x onerror=alert(1)>'}),user:null});
  assert.doesNotMatch(await bad.text(), /<img src=x/);
  assert.equal(modelSuggestions({query:new URLSearchParams({memory_budget_mib:"1e3"}),user:null},true).status,400);
});
