export function registerBrowser() {
  function detectGPU() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return null;
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                 : gl.getParameter(gl.RENDERER);
    } catch (e) { return null; }
  }
  function parseChip(raw) {
    var m = /Apple M(\d+)(?:\s*(Pro|Max|Ultra))?/.exec(raw || "");
    return m ? { chip: m[0], family: "M" + m[1], variant: m[2] || "" } : null;
  }
  var btn = document.getElementById("register-browser");
  if (btn) btn.addEventListener("click", function () {
    var status = document.getElementById("register-status");
    btn.disabled = true;
    var raw = detectGPU() || navigator.platform || "unknown device";
    var chip = parseChip(raw);
    var ram = navigator.deviceMemory ? Number(navigator.deviceMemory) : null;
    var payload = {
      label: chip ? chip.chip : String(raw).slice(0, 40),
      profile: { hardware: {
        os: "browser", arch: /Mac/.test(navigator.platform) ? "apple_silicon?" : "other",
        backend: "unknown",
        chip: chip ? chip.chip : String(raw).slice(0, 60),
        family: chip ? chip.family : "",
        variant: chip ? chip.variant : "",
        ram_gib: ram, metal_cap_gib: null, model_budget_gib: null,
        mem_bandwidth_gbs: null, bw_source: "browser_estimate"
      }}
    };
    status.textContent = "Creating pairing request…";
    fetch("/api/pair/start", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (doc) {
      if (doc.code) window.location = "/pair/" + doc.code;
      else { status.textContent = "Could not start pairing (" + (doc.error || "?") + ")"; btn.disabled = false; }
    }).catch(function () {
      status.textContent = "Network error — try again."; btn.disabled = false;
    });
  });
  var copy = document.getElementById("copy-cmds");
  if (copy) copy.addEventListener("click", function () {
    navigator.clipboard.writeText("git clone https://github.com/stevekkall-beansgc/beanfit && cd beanfit && PYTHONPATH=src python3 -m beanfit register");
    copy.textContent = "copied";
  });
}
