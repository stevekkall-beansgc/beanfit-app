import { html, json } from "../lib/http.js";
import { esc, layout } from "../pages.js";
import { onDeviceCatalog, suggestOnDevice } from "../lib/on-device.js";

const DEVICES = [["unknown", "Choose your iPhone"], ...onDeviceCatalog.devices.map(d => [d.id, d.name])];

function options(ctx) {
  const query = ctx.query;
  const number = key => {
    if (!query.has(key) || query.get(key) === "") return null;
    const value = query.get(key);
    if (!/^\d+$/.test(value)) throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const mib = number("memory_budget_mib");
  return { experience: query.get("experience") ?? "text_assistant", device: query.get("device") ?? "unknown",
    os_major: number("ios"), memory_budget_bytes: mib === null ? null : mib * 1024 ** 2,
    preference: query.get("preference") ?? "balanced" };
}

const LABELS = {
  needs_device_evidence: "Candidate for testing; memory fit unknown",
  known_task_failure: "Failed existing shopping tests",
  requires_runtime_integration: "Needs additional app support",
  unsupported_or_unknown_device: "Choose a phone in the evaluation list",
  unsupported_or_unknown_os: "Current Pocket runtime requires iOS 26+",
  weights_exceed_memory_budget: "Weight file size reaches the test allowance; excluded conservatively",
};

export function modelSuggestions(ctx, api = false) {
  let opts, result;
  try { opts = options(ctx); result = suggestOnDevice(opts); }
  catch { return api ? json({ error: "Invalid model suggestion options" }, 400)
    : html(layout("Model suggestions", '<h1>Check the model options</h1><p>Choose a listed experience, a valid iOS version, and a positive whole-number memory allowance.</p><a href="/models">Start again</a>', ctx.user), 400); }
  if (api) return json(result);
  const option = (value, name, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(name)}</option>`;
  const modelRows = result.candidates.map(m => `<article class="card">
    <h2>${esc(m.name)}</h2><p><strong>${esc(LABELS[m.status])}</strong></p>
    <p>${esc(m.summary)}</p><p>${esc((m.download_bytes / 1e6).toFixed(1))} MB of weight components. Working memory is unverified.</p>
    <details><summary>Sources and exact files</summary><p><a href="${esc(m.source_url)}">Publisher/model information</a></p>
    ${m.artifacts.map(a => `<p><a href="${esc(`https://huggingface.co/${a.repository}/blob/${a.revision}/${a.filename}`)}">${esc(a.filename)}</a><br><small>SHA-256: ${esc(a.sha256)}</small></p>`).join("")}</details></article>`).join("");
  const body = `<h1>Local AI for your iPhone</h1>
    <p>Choose an experience to explore current models. These are candidates to test; no configuration here is production-qualified.</p>
    <form method="get" action="/models" class="card">
      <label>Experience <select name="experience">${onDeviceCatalog.experiences.map(e => option(e.id, e.name, opts.experience)).join("")}</select></label><br>
      <label>Phone <select name="device">${DEVICES.map(([id, name]) => option(id, name, opts.device)).join("")}</select></label>
      <p class="muted">Device families are evaluation targets, not qualification evidence. Choose the iOS version actually installed.</p>
      <label>iOS major version <input name="ios" type="number" min="1" max="100" value="${esc(opts.os_major ?? "")}" placeholder="26"></label>
      <label>Order <select name="preference">${option("balanced", "Task-specific test order", opts.preference)}${option("smallest_download", "Smallest download first", opts.preference)}</select></label>
      <details><summary>Optional test memory allowance</summary><label>MiB <input name="memory_budget_mib" type="number" min="1" value="${esc(opts.memory_budget_bytes === null ? "" : opts.memory_budget_bytes / 1024 ** 2)}"></label>
      <p>Use an application memory allowance, not the phone’s total RAM. Files reaching it are conservatively excluded before testing. File size is not resident memory; all candidates need complete memory measurement.</p></details>
      <button type="submit">Show model candidates</button>
    </form>
    <p>Catalog checked ${esc(result.catalog_as_of)}. The current native app supports short text requests. Vision and speech entries require further integration.</p>
    ${opts.experience === "shopping_filters" ? '<p class="card">Use reviewed manual filters or the bounded parser for shopping. Existing Liquid 350M and Qwen 0.8B configurations failed the frozen task tests.</p>' : ""}
    <p>Testable candidates: ${esc(result.trial_order.map(id => result.candidates.find(m => m.id === id).name).join(", ") || "none for these settings")}. Ordering is a starting point for comparison, not a measured quality ranking.</p>
    ${modelRows}`;
  return html(layout("Local model candidates", body, ctx.user));
}
