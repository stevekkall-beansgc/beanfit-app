// Server-rendered pages. No framework, no client build step.

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
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.pair-code { font-size: 2rem; letter-spacing: .35em; font-family: ui-monospace, monospace; }
@media (prefers-color-scheme: dark) {
  body { background: #0f1216; color: #e6e8eb; }
  .card { background: #171c22; border-color: #232a33; }
  th, td { border-color: #232a33; } code, pre { background: #1d242c; }
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

export function landing() {
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
       <p><a href="/signup"><button>Create your account</button></a></p>
     </div>
     <p class="muted">Hardware detection runs locally. We store the profile you see when you
     approve pairing — nothing else. No telemetry without a paired device.</p>`);
}

export function signupForm(error = "", email = "", next = "", sso = false) {
  const googleBtn = sso ? `
     <a href="/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}">
       <button class="secondary" style="width:100%">Continue with Google</button>
     </a>
     <p class="muted" style="text-align:center">or use email below</p>` : "";
  return layout("Create account",
    `<h1>Create account</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <form method="post" action="/signup" class="card">
       ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
       ${googleBtn}
       <label>Email<br><input type="email" name="email" required value="${esc(email)}"></label>
       <label>Password (10+ characters)<br><input type="password" name="password" minlength="10" required></label>
       <button>Create account</button>
     </form>
     <p class="muted">Have one? <a href="/login">Sign in</a>.</p>`);
}

export function loginForm(error = "", next = "", sso = false) {
  const googleBtn = sso ? `
     <a href="/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}">
       <button class="secondary" style="width:100%">Continue with Google</button>
     </a>
     <p class="muted" style="text-align:center">or use email below</p>` : "";
  return layout("Sign in",
    `<h1>Sign in</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <form method="post" action="/login" class="card">
       ${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ""}
       ${googleBtn}
       <label>Email<br><input type="email" name="email" required></label>
       <label>Password<br><input type="password" name="password" required></label>
       <button>Sign in</button>
     </form>`);
}

export function dashboard(user, devices) {
  const cards = devices.map(d => `
    <a href="/devices/${esc(d.id)}" style="text-decoration:none;color:inherit">
      <div class="card" style="margin:0">
        <strong>${esc(d.label)}</strong>
        <div class="muted">${esc(d.chip ?? "")} · ${esc(String(d.ram_gib ?? ""))} GiB</div>
      </div>
    </a>`).join("");
  return layout("Your devices",
    `<h1>Your devices</h1>
     ${devices.length ? `<div class="grid">${cards}</div>` :
       `<div class="card"><p>No registered devices yet.</p>
        <p class="muted">On the machine you want to register:</p>
        <pre>$ pipx install beanfit
$ beanfit register</pre>
        <p class="muted">You'll get a pairing code to approve here.</p></div>`}`);
}

export function pairConfirm(user, device, csrf, recsPayload) {
  const p = device;
  return layout("Approve device",
    `<h1>Pair this device?</h1>
     <div class="card">
       <table>
         <tr><th>Machine</th><td>${esc(p.chip ?? "unknown")} · ${esc(String(p.ram_gib ?? "?"))} GiB</td></tr>
         <tr><th>OS / backend</th><td>${esc(p.os ?? "?")} / ${esc(p.backend ?? "?")}</td></tr>
         <tr><th>Usable model budget</th><td>${esc(String(p.model_budget_gib ?? "?"))} GiB</td></tr>
         <tr><th>Est. memory bandwidth</th><td>~${esc(String(p.mem_bandwidth_gbs ?? "?"))} GB/s
             <span class="badge warn">${esc((p.bw_source ?? "unknown").replace("_", " "))}</span></td></tr>
       </table>
     </div>
     ${recsPayload ? renderRecs(recsPayload) : ""}
     <p class="muted">Approving links this device to <strong>${esc(user.email)}</strong>. You can revoke it anytime.
     beanfit will use it to send you fit updates when better models land.</p>
     <form method="post" action="/pair/${esc(p.pair_code)}/approve">
       <input type="hidden" name="csrf" value="${esc(csrf)}">
       <label>Nickname<br><input name="label" value="${esc(p.label)}" required maxlength="64"></label>
       <button>Approve &amp; register</button>
       <button class="secondary" formaction="/pair/${esc(p.pair_code)}/deny">Deny</button>
     </form>`);
}

export function renderRecs(payloadJson) {
  let doc;
  try { doc = JSON.parse(payloadJson); } catch { return ""; }
  const rows = (doc.ranked ?? []).slice(0, 8);
  if (!rows.length) return "";
  return `<div class="card">
    <h2>Recommendations snapshot (${esc(doc.use_case ?? "chat")})</h2>
    <table>
      <tr><th>Model</th><th>Quant</th><th class="num">Total</th><th class="num">tok/s est</th><th>Fits</th></tr>
      ${rows.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.quant ?? "—")}</td>
        <td class="num">${r.total_gib != null ? esc(r.total_gib) + "G" : "—"}</td>
        <td class="num">${r.est_tok_s != null ? "~" + esc(r.est_tok_s) + " ±" + esc(r.est_uncertainty_pct ?? "%") + "%" : "—"}</td>
        <td>${r.fits ? '<span class="badge ok">yes</span>' : '<span class="badge warn">no</span>'}</td>
      </tr>`).join("")}
    </table>
    <p class="muted">Speed numbers are estimates with stated uncertainty — verify with
    <code>ollama run --verbose</code>.</p>
  </div>`;
}

export function deviceDetail(device, rec) {
  return layout(device.label,
    `<h1>${esc(device.label)}</h1>
     <p class="muted">${esc(device.chip ?? "")} · ${esc(device.os ?? "")} · budget
     ${esc(String(device.model_budget_gib ?? "?"))} GiB · registered ${esc(device.approved_at ?? "")}</p>
     ${rec ? renderRecs(rec.payload_json)
       : `<div class="card muted">No recommendation snapshot stored yet.</div>`}`);
}

export function pairDone(ok, message) {
  return layout(ok ? "Device approved" : "Pairing",
    `<h1>${ok ? "Device approved" : "Not available"}</h1>
     <div class="card"><p>${esc(message)}</p></div>`);
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

export function pairLookupForm(error = "", csrf = "") {
  return layout("Register a device",
    `<h1>Register a device</h1>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <p class="muted">Run <code>beanfit register</code> on your machine, then enter its code:</p>
     <form method="get" action="/pair" class="card">
       <label>Pairing code<br><input name="code" placeholder="XXXXXXXX" required
              pattern="[0-9A-HJKMNP-TV-Z-Za-z]{8}" maxlength="8"
              style="text-transform:uppercase;font-family:ui-monospace,monospace;letter-spacing:.3em"></label>
       <button>Find device</button>
     </form>`);
}
