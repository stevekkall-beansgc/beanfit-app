import { makeAuthHandlers } from "./routes/auth.js";
import { makePageHandlers, makePairApiHandlers } from "./routes/pair.js";
import { html } from "./lib/http.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const auth = makeAuthHandlers(env);
      const pages = makePageHandlers(env, auth);
      const api = makePairApiHandlers(env);

      const ctx = {
        request,
        env,
        query: url.searchParams,
        params: {},
        form: null,
        user: await auth.userFromRequest(request),
      };

      const route = match(url.pathname, request.method === "HEAD" ? "GET" : request.method);
      if (!route) return new Response("Not found", { status: 404 });
      Object.assign(ctx.params, route.params);

      const contentType = request.headers.get("content-type") ?? "";
      if (request.method === "POST" && contentType.includes("form")) {
        ctx.form = await request.formData().then(f => Object.fromEntries(f.entries()));
      }
      if (route.auth === "required" && !ctx.user) {
        return Response.redirect(
          new URL(`/login?next=${encodeURIComponent(url.pathname)}`, url.origin), 303,
        );
      }
      return route.handler.call(null, ctx, { auth, pages, api });
    } catch (err) {
      console.error("unhandled", err?.stack ?? err);
      if (url.pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "internal" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
      const detail = env.ENVIRONMENT === "dev"
        ? `<pre>${String(err?.stack ?? err)}</pre>`
        : "<p>Something went wrong. Try again.</p>";
      return html(detail, 500);
    }
  },
};

const ROUTES = [
  ["GET", "/", (c, h) => h.pages.landing(c)],
  ["GET", "/signup", (c, h) => h.auth.signupPage(c)],
  ["POST", "/signup", (c, h) => h.auth.signupSubmit(c)],
  ["GET", "/login", (c, h) => h.auth.loginPage(c)],
  ["POST", "/login", (c, h) => h.auth.loginSubmit(c)],
  ["GET", "/auth/google/start", (c, h) => h.auth.googleStart(c)],
  ["GET", "/auth/google/callback", (c, h) => h.auth.googleCallback(c)],
  ["GET", "/logout", (c, h) => h.auth.logoutPage(c), "required"],
  ["POST", "/logout", (c, h) => h.auth.logoutSubmit(c)],
  ["GET", "/dashboard", (c, h) => h.pages.dashboard(c), "required"],
  ["GET", "/devices/:id", (c, h) => h.pages.deviceDetail(c), "required"],
  ["POST", "/api/devices/:id/stack", (c, h) => h.pages.generateStackRoute(c), "required"],
  ["GET", "/pair", (c, h) => h.pages.pairLookup(c), "required"],
  ["GET", "/pair/:code", (c, h) => h.pages.pairConfirmRoute(c), "required"],
  ["POST", "/pair/:code/approve", (c, h) => h.pages.pairApprove(c), "required"],
  ["POST", "/pair/:code/deny", (c, h) => h.pages.pairDeny(c), "required"],
  ["POST", "/api/pair/start", (c, h) => h.api.start(c)],
  ["GET", "/api/pair/status/:pairId", (c, h) => h.api.status(c)],
];

function match(pathname, method) {
  for (const [m, pattern, handler, auth] of ROUTES) {
    if (m !== method) continue;
    const pp = pattern.split("/").filter(Boolean);
    const ap = pathname.split("/").filter(Boolean);
    if (pp.length !== ap.length) continue;
    const params = {};
    let hit = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (pp[i] !== ap[i]) { hit = false; break; }
    }
    if (hit) return { handler, auth, params };
  }
  return null;
}
