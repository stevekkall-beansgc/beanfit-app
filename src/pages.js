// Server-rendered pages. No framework, no client build step.
import {
  speedBand, modelInfo, capabilityHeadline, deviceTasks, PROMISES, plainPicks,
} from "./lib/plain.js";
import { SURFACES, modelChoices } from "./lib/stack.js";

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0;
       background: #f6f7f9; color: #1a1d21; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
header.site { background: #11151a; color: #fff; padding: 14px 16px; }
header.site .inner { max-width: 860px; margin: 0 auto; display: flex;
                     justify-content: space-between; align-items: center; }
header.site a { color: #fff; text-decoration: none; font-weight: 600; }
header.site nav a { font-weight: 400; opacity: .85; margin-left: 16px; }
h1 { font-size: 1.5rem; margin: 8px 0 4px; } h2 { font-size: 1.15rem; }
.card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px;
        padding: 18px 20px; margin: 14px 0; }
.muted { color: #667085; font-size: .92rem; }
table { width: 100%; border-collapse: collapse; font-size: .93rem; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eceef1; }
td.num, th.num { text-align: right; }
.badge { display: inline-block; padding: 2px 9px; border-radius: 99px;
         font-size: .78rem; font-weight: 600; }
.badge.ok { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
code, pre { background: #f1f3f5; border-radius: 6px; font-size: .88rem; }
pre { padding: 12px 14px; overflow-x: auto; }
input, button { font-size: 1rem; padding: 9px 12px; border-radius: 8px;
                border: 1px solid #cfd6de; width: 100%; margin: 4px 0 12px; }
button { background: #14532d; color: #fff; border: none; cursor: pointer;
         font-weight: 600; width: auto; padding: 10px 22px; }
button.secondary { background: #e5e7eb; color: #374151; }
.error { color: #b91c1c; margin: 4px 0 10px; }
.divider { display: flex; align-items: center; gap: 10px;
          color: #667085; font-size: .85rem; margin: 14px 0; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px;
          background: #d5dae0; }
a.btn { display: block; text-align: center; text-decoration: none;
        font-size: 1rem; padding: 9px 12px; margin: 4px 0 12px; border-radius: 8px;
        border: 1px solid #cfd6de; color: #1a1d21; background: #fff; }
a.btn:hover { background: #f0f2f5; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.pair-code { font-size: 2rem; letter-spacing: .35em; font-family: ui-monospace, monospace; }
@media (prefers-color-scheme: dark) {
  body { background: #0f1216; color: #e6e8eb; }
  .card { background: #171c22; border-color: #232a33; }
  th, td { border-color: #232a33; } code, pre { background: #1d242c; }
  .divider::before, .divider::after { background: #2a323c; }
}
`;

export function layout(title, content, user = null) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · beanfit</title>
<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="inner">
  <a href="/">beanfit</a>
  <nav>
    ${user
      ? `<span class="muted" style="color:#aab">${esc(user.email)}</span><a href="/logout">Sign out</a>`
      : `<a href="/login">Sign in</a><a href="/signup">Create account</a>`}
  </nav>
</div></header>
<main>${content}</main>
</body></html>`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function landing(user = null) {
  return layout("What runs on your machine — and stays optimal",
    `<h1>Your local AI stack, sized for YOUR hardware.</h1>
     <p class="muted">beanfit detects what your device can actually run — model × quant ×
     runtime with honest speed estimates — registers it to your account, and keeps
     recommendations current as better models ship.</p>
     <div class="card">
       <h2>Three steps</h2>
       <ol>
         <li><strong>Create an account</strong> (you're here).</li>
         <li><strong>Register your device</strong>: run <code>beanfit register</code> in your
             terminal and approve the pairing code here.</li>
         <li><strong>Get your stack</strong>: exact commands to run the best models for your
             machine — plus an alert when something better fits.</li>
       </ol>
       ${user
        ? `<p><a href="/dashboard"><button>Go to your devices</button></a></p>`
        : `<p><a href="/signup"><button>Create your account</button></a></p>`}
     </div>
     <p class="muted">Hardware detection runs locally. We store the profile you see when you
     approve pairing — nothing else. No telemetry without a paired device.</p>`, user);
}

export function signupForm(error = "", email = "", next = "", sso = false) {
  const googleBtn = sso ? `
       <a class="btn" href="/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}">Continue with Google</a>
       <div class="divider">or sign up with email</div>
       <p class="muted">Prefer a password? Set one below instead.</p>` : "";
  return layout("Create account",
    `<h1>Create your free account</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <div class="card">
      ${googleBtn}
      <form method="post" action="/signup">
       ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
       <label>Email<br><input type="email" name="email" required value="${esc(email)}" autocomplete="email"></label>
       <label>Password<br><input type="password" name="password" minlength="10" required autocomplete="new-password"></label>
       <button>Create account</button>
      </form>
     </div>
     <p class="muted">Already registered? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ""}">Sign in</a>.</p>`);
}

export function loginForm(error = "", next = "", sso = false) {
  const googleBtn = sso ? `
       <a class="btn" href="/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}">Continue with Google</a>
       <div class="divider">or continue with email</div>` : "";
  return layout("Sign in",
    `<h1>Sign in</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <div class="card">
      ${googleBtn}
      <form method="post" action="/login">
       ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
       <label>Email<br><input type="email" name="email" required autocomplete="email"></label>
       <label>Password<br><input type="password" name="password" required autocomplete="current-password"></label>
       <button>Sign in</button>
      </form>
      ${sso ? `<p class="muted">Signed up with Google? You don't have a password — use the button above.</p>` : ""}
     </div>
     <p class="muted">New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ""}">Create an account</a>.</p>`);
}

export function dashboard(user, devices) {
  const cards = devices.map(d => `
    <a href="/devices/${esc(d.id)}" style="text-decoration:none;color:inherit">
      <div class="card" style="margin:0">
        <strong>${esc(d.label)}</strong>
        <div>${esc(capabilityHeadline(d.model_budget_gib).headline)}</div>
        <div class="muted">${esc(d.chip ?? "")}
          ${d.bw_source === "browser_estimate" ? `· <span class="badge warn">estimate</span>` : ""}</div>
      </div>
    </a>`).join("");

  const emptyState = `
    <div class="card">
      <h2 style="margin-top:0">Register this device</h2>
      <p><button id="register-browser" style="width:100%">Register this device (quick estimate)</button></p>
      <p class="muted" id="register-status">Reads your chip name from the browser — takes one click.
      Exact numbers (RAM, memory cap) come from the CLI below.</p>
      <div class="divider">or register with exact numbers</div>
      <p class="muted">On the machine you want to register:</p>
      <pre id="cli-cmds">$ pipx install beanfit
$ beanfit register  <button class="secondary" id="copy-cmds" style="padding:2px 10px;font-size:.8rem">copy</button></pre>
      <p class="muted">You'll get a pairing code to approve here — same as the quick path,
      but with exact hardware and full recommendations.</p>
    </div>
    <script>
    (function () {
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
        navigator.clipboard.writeText("pipx install beanfit && beanfit register");
        copy.textContent = "copied";
      });
    })();
    </script>`;

  return layout("Your devices",
    `<h1>Your devices</h1>
     ${devices.length ? `<div class="grid">${cards}</div>` : emptyState}
     ${devices.length ? `<p class="muted">To register another machine, run
       <code>pipx install beanfit &amp;&amp; beanfit register</code> on it.</p>` : ""}`, user);
}

export function pairConfirm(user, device, csrf, recsPayload) {
  const p = device;
  const cap = capabilityHeadline(p.model_budget_gib);
  return layout("Approve device",
    `<h1>Pair this device?</h1>
     <div class="card">
       <h2 style="margin-top:0">${esc(cap.headline)}</h2>
       <ul style="margin:6px 0">${cap.tasks.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
       <p class="muted" style="margin:8px 0 0">${esc(cap.detail)} And:</p>
       <ul class="muted" style="margin:4px 0 0">${PROMISES.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
     </div>
     <details class="card muted">
       <summary style="cursor:pointer">Technical profile</summary>
       <table>
         <tr><th>Machine</th><td>${esc(p.chip ?? "unknown")} · ${p.ram_gib != null ? esc(String(p.ram_gib)) + " GiB" : "RAM not read"}</td></tr>
         <tr><th>OS / backend</th><td>${esc(p.os ?? "?")} / ${esc(p.backend ?? "?")}</td></tr>
         <tr><th>Usable model budget</th><td>${p.model_budget_gib != null ? esc(String(p.model_budget_gib)) + " GiB" : "not measured"}</td></tr>
         <tr><th>Est. memory bandwidth</th><td>${p.mem_bandwidth_gbs != null ? "~" + esc(String(p.mem_bandwidth_gbs)) + " GB/s" : "not measured"}
             <span class="badge warn">${esc((p.bw_source ?? "unknown").replace("_", " "))}</span></td></tr>
       </table>
     </details>
     ${recsPayload ? renderRecs(recsPayload) : ""}
     <p class="muted">Approving links this device to <strong>${esc(user.email)}</strong>. You can revoke it anytime.
     beanfit will use it to send you fit updates when better models land.</p>
     <form method="post" action="/pair/${esc(p.pair_code)}/approve">
       <input type="hidden" name="csrf" value="${esc(csrf)}">
       <label>Nickname<br><input name="label" value="${esc(p.label)}" required maxlength="64"></label>
       <button>Approve &amp; register</button>
       <button class="secondary" formaction="/pair/${esc(p.pair_code)}/deny">Deny</button>
     </form>`, user);
}

function pickCard(key, r) {
  const info = modelInfo(r.runtime_tag, r.total_gib);
  const speed = speedBand(r.est_tok_s) ?? { label: "?", plain: "" };
  const cmd = "ollama pull " + r.runtime_tag + " && ollama run " + r.runtime_tag;
  const tasks = (info.tasks ?? []).map(t => `<li>${esc(t)}</li>`).join("");
  return `<div class="card" style="margin:10px 0">
    <div class="muted" style="text-transform:uppercase;font-size:.72rem;letter-spacing:.08em">${esc(key)}</div>
    <h2 style="margin:4px 0 2px">${esc(r.name)} <span class="muted" style="font-weight:400">· ${esc(info.role)}</span></h2>
    <p style="margin:4px 0 6px"><strong>Good for:</strong></p>
    <ul style="margin:0 0 8px">${tasks}</ul>
    <p style="margin:4px 0"><strong>Speed: ${esc(speed.label)}</strong>
      <span class="muted">— ${esc(speed.plain)}</span></p>
    <details>
      <summary class="muted" style="cursor:pointer">Try it (one-time setup)</summary>
      <p class="muted">This downloads the AI to this machine (one time) and opens a private chat.
      Paste into Terminal (the app on your Mac):</p>
      <pre>${esc(cmd)}</pre>
    </details>
  </div>`;
}

export function renderRecs(payloadJson) {
  let doc;
  try { doc = JSON.parse(payloadJson); } catch { return ""; }
  const rows = doc.ranked ?? [];
  const picks = plainPicks(rows);
  const tech = rows.slice(0, 8);
  if (!tech.length) return "";
  return `
    ${picks.map(({ key, row }) => pickCard(key, row)).join("")}
    <details class="card muted">
      <summary style="cursor:pointer">For the curious: the full technical rundown</summary>
      <table>
        <tr><th>Model</th><th>Quant</th><th class="num">Total</th><th class="num">tok/s est</th><th>Fits</th></tr>
        ${tech.map(r => `<tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.quant ?? "—")}</td>
          <td class="num">${r.total_gib != null ? esc(r.total_gib) + "G" : "—"}</td>
          <td class="num">${r.est_tok_s != null ? "~" + esc(r.est_tok_s) + " ±" + esc(r.est_uncertainty_pct ?? "%") + "%" : "—"}</td>
          <td>${r.fits ? '<span class="badge ok">yes</span>' : '<span class="badge warn">no</span>'}</td>
        </tr>`).join("")}
      </table>
      <p>Speed numbers are estimates with stated uncertainty — verify with
      <code>ollama run --verbose</code>.</p>
    </details>`;
}

export function renderStack(stack) {
  const warnings = (stack.warnings ?? [])
    .map(w => `<p class="error">${esc(w)}</p>`).join("");
  const steps = (stack.steps ?? []).map((st, i) => `
    <li style="margin:10px 0">
      <strong>${i + 1}. ${esc(st.title)}</strong>
      ${st.detail ? `<div class="muted">${esc(st.detail)}</div>` : ""}
      ${st.code ? `<pre>${esc(st.code)}</pre>` : ""}
    </li>`).join("");
  const files = (stack.files ?? []).map(f => `
    <div class="card" style="margin:8px 0">
      <strong>${esc(f.name)}</strong>
      <button class="secondary copy-btn" data-code="${esc(f.content)}" style="margin-left:12px;padding:2px 10px;font-size:.8rem">copy</button>
      <pre>${esc(f.content)}</pre>
    </div>`).join("");
  return `<div id="stack-output">
    ${warnings}
    <ol style="padding-left:20px">${steps}</ol>
    ${files}
    <p class="muted">Generated ${esc((stack.generated_at ?? "").slice(0, 10))} · your choices are saved to this device.</p>
  </div>`;
}

export function stackForm(device, rec) {
  let ranked = [];
  try { ranked = JSON.parse(rec?.payload_json ?? "{}").ranked ?? []; } catch {}
  const fits = ranked.filter(r => r.fits);
  const rest = ranked.filter(r => !r.fits);
  const opt = r => `<option value="${esc(r.runtime_tag)}">${esc(r.name)}</option>`;
  const surfaces = Object.entries(SURFACES).map(([id, s], i) => `
    <label style="display:block;margin:6px 0">
      <input type="checkbox" name="surf" value="${id}" ${i === 0 ? "checked" : ""} style="width:auto;margin-right:8px">
      ${esc(s.label)} <span class="muted">— ${esc(s.plain)}</span>
    </label>`).join("");
  return `<div class="card" id="stack-config">
    <h2 style="margin-top:0">Build your setup</h2>
    <p class="muted">Tick what you want to do with it — our suggestion comes pre-built, change anything.</p>
    <p><strong>What do you want to do?</strong></p>
    ${surfaces}
    <p style="margin-top:14px"><strong>Which AI?</strong></p>
    <select name="model" style="width:100%">
      <optgroup label="Runs great on this machine">${fits.map(opt).join("")}</optgroup>
      ${rest.length ? `<optgroup label="Ambitious for this machine (will warn)">${rest.map(opt).join("")}</optgroup>` : ""}
    </select>
    <button id="gen-stack" style="margin-top:12px">Generate my setup</button>
    <div id="stack-result" style="margin-top:14px"></div>
    <script>
    (function () {
      var btn = document.getElementById("gen-stack");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var root = document.getElementById("stack-config");
        var surfaces = Array.prototype.slice.call(
          root.querySelectorAll('input[name="surf"]:checked')
        ).map(function (c) { return c.value; });
        if (!surfaces.length) { alert("Pick at least one thing to do"); return; }
        var model = root.querySelector('select[name="model"]').value;
        btn.disabled = true; btn.textContent = "Building…";
        fetch("/api/devices/${esc(device.id)}/stack", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ surfaces: surfaces, model_tag: model })
        }).then(function (r) { return r.text(); }).then(function (frag) {
          document.getElementById("stack-result").innerHTML = frag;
          bindCopies();
          btn.disabled = false; btn.textContent = "Generate my setup";
        });
      });
      function bindCopies() {
        document.querySelectorAll("#stack-result .copy-btn").forEach(function (b) {
          b.addEventListener("click", function () {
            navigator.clipboard.writeText(b.getAttribute("data-code"));
            b.textContent = "copied";
          });
        });
      }
      bindCopies();
    })();
    </script>
  </div>`;
}

export function deviceDetail(device, rec, user = null, stack = null) {
  const cap = capabilityHeadline(device.model_budget_gib);
  return layout(device.label,
    `<h1>${esc(device.label)}</h1>
     <p><strong>${esc(cap.headline)}</strong></p>
     <ul style="margin:6px 0">${cap.tasks.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
     <p class="muted">${esc(cap.detail)}</p>
     <p class="muted">${esc(device.chip ?? "")} · registered ${esc(device.approved_at ?? "")}
       <details><summary style="cursor:pointer;display:inline">technical</summary>
       ${esc(device.os ?? "")} · budget ${device.model_budget_gib != null ? esc(String(device.model_budget_gib)) + " GiB" : "not measured"}</details></p>
     ${rec ? renderRecs(rec.payload_json)
       : `<div class="card muted">No recommendation snapshot stored yet.</div>`}
     ${stack ? `<div class="card"><h2 style="margin-top:0">Your setup</h2>${renderStack(stack)}</div>` : ""}
     ${stackForm(device, rec)}`, user);
}

export function pairDone(ok, message, user = null) {
  return layout(ok ? "Device approved" : "Pairing",
    `<h1>${ok ? "Device approved" : "Not available"}</h1>
     <div class="card"><p>${esc(message)}</p></div>`, user);
}

export function pairPendingPage(code) {
  return layout("Waiting for approval",
    `<h1>Almost there</h1>
     <div class="card">
       <p>Open this page on any browser where you're signed in, or enter code
       <strong>${esc(code)}</strong> at <code>/pair</code>.</p>
       <p class="pair-code">${esc(code)}</p>
       <p class="muted">Codes expire in 15 minutes.</p>
     </div>`);
}

export function logoutConfirm(user, csrf) {
  return layout("Sign out",
    `<h1>Sign out?</h1>
     <form method="post" action="/logout" class="card">
       <input type="hidden" name="csrf" value="${esc(csrf)}">
       <p class="muted">Signed in as ${esc(user?.email ?? "")}. Your devices stay registered.</p>
       <button>Sign out</button>
       <button class="secondary" formaction="/dashboard">Cancel</button>
     </form>`, user);
}

export function pairLookupForm(error = "", user = null) {
  return layout("Register a device",
    `<h1>Register a device</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <p class="muted">Run <code>beanfit register</code> on your machine, then enter its code:</p>
     <form method="get" action="/pair" class="card">
       <label>Pairing code<br><input name="code" placeholder="XXXXXXXX" required
              pattern="[0-9A-HJKMNP-TV-Z-Za-z]{8}" maxlength="8"
              style="text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:.3em"></label>
       <button>Find device</button>
     </form>`, user);
}
