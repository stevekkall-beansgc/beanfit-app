// Shared fit math — mirrors beanfit CLI engine (source of truth) so the
// server can re-fit stored devices against new catalog rows for drift-watch.
export const QUANT_SPEEDUP = { q4: 1.0, q8: 0.62 };
export const UNCERTAINTY_PCT = {
  spec_sheet: 25,
  estimate: 40,
  unknown_fallback: 50,
};

export function decodeTokS(bandwidthGbs, totalMemGib, quant) {
  const speedup = QUANT_SPEEDUP[quant.split("_")[0]];
  if (speedup === undefined) throw new Error(`unknown quant label: ${quant}`);
  return bandwidthGbs / totalMemGib * 0.85 * speedup;
}

export function fits(model, hw) {
  // model: {mem_q4, mem_q8, kv32k}; hw: {model_budget_gib}
  for (const [quant, mem] of [["q4_K_M", model.mem_q4], ["q8_0", model.mem_q8]]) {
    const total = mem + model.kv32k * 0.5;
    if (total <= hw.model_budget_gib) {
      return {
        quant,
        total_gib: Math.round(total * 10) / 10,
        est_tok_s: Math.round(decodeTokS(hw.mem_bandwidth_gbs, total, quant) * 10) / 10,
        fits: true,
      };
    }
  }
  return { fits: false };
}

// Whitelist + coerce a CLI-submitted profile. Everything else is dropped.
export function sanitizeProfile(raw) {
  const num = (v, lo, hi) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  const str = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : null);
  const p = raw && typeof raw === "object" ? raw.hardware ?? raw : null;
  if (!p || typeof p.chip !== "string") return null;
  return {
    os: str(p.os, 16), arch: str(p.arch, 24), backend: str(p.backend, 16),
    chip: str(p.chip, 64), family: str(p.family, 8), variant: str(p.variant, 16),
    ram_gib: num(p.ram_gib, 0.5, 1024),
    metal_cap_gib: num(p.metal_cap_gib, 0.5, 1024),
    model_budget_gib: num(p.model_budget_gib, 1, 1024),
    mem_bandwidth_gbs: num(p.mem_bandwidth_gbs, 1, 10000),
    bw_source: str(p.bw_source, 24),
  };
}

export function sanitizeRanked(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map(r => ({
    name: String(r.name ?? "").slice(0, 64),
    runtime_tag: String(r.runtime_tag ?? "").slice(0, 48),
    quality: Number(r.quality) || 0,
    score: Number(r.score) || 0,
    fits: Boolean(r.fits),
    quant: r.quant == null ? null : String(r.quant).slice(0, 12),
    weights_gib: r.weights_gib == null ? null : Number(r.weights_gib),
    total_gib: r.total_gib == null ? null : Number(r.total_gib),
    est_tok_s: r.est_tok_s == null ? null : Number(r.est_tok_s),
    est_uncertainty_pct: r.est_uncertainty_pct == null ? null : Number(r.est_uncertainty_pct),
  }));
}
