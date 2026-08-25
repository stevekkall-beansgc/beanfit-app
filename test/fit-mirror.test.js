// Conformance pin: beanfit-app's JS fit math mirrors beanfit's Python engine
// (audit X5). Skips when the sibling CLI repo isn't checked out (CI) — run
// locally or via the cross-repo e2e for enforcement.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const pyEngine = [
  process.env.BEANFIT_SRC && path.join(process.env.BEANFIT_SRC, "beanfit/engine/estimate.py"),
  path.resolve(here, "../../beanfit/src/beanfit/engine/estimate.py"),
].find((p) => p && fs.existsSync(p));

function parseDict(src, name) {
  const m = new RegExp(`(?:const|SECRET_PATTERNS\\s*=|)\\s*${name}\\s*=\\s*\\{([^}]*)\\}`, "m").exec(src);
  if (!m) return null;
  const out = {};
  for (const [, k, v] of m[1].matchAll(/([A-Za-z_0-9."'-]+)\s*:\s*([\d.]+)/g)) {
    out[k.replace(/['"]/g, "")] = parseFloat(v);
  }
  return out;
}

test("fit.js QUANT_SPEEDUP + UNCERTAINTY_PCT match beanfit engine", { skip: !pyEngine && "beanfit engine not checked out" }, () => {
  const py = fs.readFileSync(pyEngine, "utf8");
  const jsPath = path.resolve(here, "../src/lib/fit.js");
  const js = fs.readFileSync(jsPath, "utf8");

  for (const dictName of ["QUANT_SPEEDUP", "UNCERTAINTY_PCT"]) {
    const pyDict = parseDict(py, dictName);
    const jsDict = parseDict(js, dictName);
    assert.ok(pyDict, `python ${dictName} not parsed`);
    assert.ok(jsDict, `js ${dictName} not parsed`);
    const norm = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k.split("_")[0], v]));
    if (dictName === "QUANT_SPEEDUP") {
      assert.deepEqual(norm(jsDict), norm(pyDict), `${dictName} values drifted`);
    } else {
      assert.deepEqual(jsDict, pyDict, `${dictName} drifted`);
    }
  }
});
