import { ON_DEVICE_CATALOG as catalog } from "./on-device-catalog.js";

export { catalog as onDeviceCatalog };

export function suggestOnDevice({ experience = "text_assistant", device = "unknown",
  os_major = null, memory_budget_bytes = null, context_tokens = 2048, preference = "balanced" } = {}) {
  const task = catalog.experiences.find(e => e.id === experience);
  if (!task) throw new Error("unknown experience");
  if (typeof device !== "string" || !device.length || device.length > 80) throw new Error("invalid device");
  if (os_major !== null && (!Number.isInteger(os_major) || os_major < 1 || os_major > 100)) throw new Error("invalid iOS version");
  if (memory_budget_bytes !== null && (!Number.isSafeInteger(memory_budget_bytes) || memory_budget_bytes < 1 || memory_budget_bytes > 2 ** 50)) throw new Error("invalid memory allowance");
  if (!Number.isInteger(context_tokens) || context_tokens < 1 || context_tokens > catalog.native_context_tokens) throw new Error("unsupported context length");
  if (!["balanced", "smallest_download"].includes(preference)) throw new Error("invalid preference");
  const knownDevice = catalog.devices.some(d => d.id === device);
  const priorities = new Map(task.trial_order.map((id, i) => [id, i]));
  const candidates = catalog.models.filter(m => m.capabilities.includes(experience)).map(m => {
    const download_bytes = m.artifacts.reduce((sum, a) => sum + a.bytes, 0);
    let status;
    if (m.runtime_status !== "native_text_candidate") status = "requires_runtime_integration";
    else if (m.failed_experiences.includes(experience)) status = "known_task_failure";
    else if (!knownDevice) status = "unsupported_or_unknown_device";
    else if (os_major === null || os_major < catalog.minimum_ios) status = "unsupported_or_unknown_os";
    else if (memory_budget_bytes !== null && download_bytes >= memory_budget_bytes) status = "weights_exceed_memory_budget";
    else status = "needs_device_evidence";
    return { id: m.id, name: m.name, status, eligible_for_trial: status === "needs_device_evidence",
      download_bytes, memory_fit: "unknown", qualified: false, summary: m.summary,
      source_url: m.source_url, artifacts: m.artifacts };
  });
  candidates.sort((a, b) => preference === "smallest_download"
    ? a.download_bytes - b.download_bytes || a.id.localeCompare(b.id)
    : priorities.get(a.id) - priorities.get(b.id) || a.id.localeCompare(b.id));
  return { schema: "beanfit.on-device.suggestions.v1", catalog_as_of: catalog.as_of,
    experience, device, os_major, context_tokens, memory_budget_bytes, preference,
    status: "needs_device_evidence", selection: null,
    trial_order: candidates.filter(r => r.eligible_for_trial).map(r => r.id),
    fallback: task.fallback, candidates,
    limits: [catalog.trial_order_basis, catalog.artifact_scope,
      "A budget is the application's incremental memory allocation, not nominal phone RAM.",
      "No candidate is production-qualified by this catalog or trial ordering.",
      "Use beanfit mobile with reviewed, comparable physical whole-stack receipts for a selection."] };
}
