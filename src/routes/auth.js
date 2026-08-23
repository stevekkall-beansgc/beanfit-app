import { html, parseCookies, sessionCookie, clearSessionCookie, redirect } from "../lib/http.js";
import { randomHex, sha256Hex, hmacHex, hashPassword, verifyPassword, timingSafeEqual } from "../lib/crypto.js";
import { createStore } from "../lib/store.js";
import { signupForm, loginForm } from "../pages.js";

export function makeAuthHandlers(env) {
  const store = createStore(env.DB);

  async function userFromRequest(request) {
    const token = parseCookies(request).bf_session;
    if (!token) return null;
    const row = await store.sessions.valid(await sha256Hex(token), nowUnix());
    return row ? { email: row.email, id: row.user_id, _token: token } : null;
  }

  // Stateless CSRF token derived from the session credential.
  async function csrfFor(request) {
    const token = parseCookies(request).bf_session;
    return token ? hmacHex(env.SESSION_SECRET, "csrf:" + (await sha256Hex(token))) : "";
  }

  async function assertCsrf(request, form) {
    const expected = await csrfFor(request);
    return expected !== "" && timingSafeEqual(String(form.csrf ?? ""), expected);
  }

  async function startSession(userId, next = "") {
    const token = randomHex(32);
    await store.sessions.create(
      await sha256Hex(token), userId, nowUnix() + 60 * 60 * 24 * 30
    );
    return redirect(next || "/dashboard", { "set-cookie": sessionCookie(token) });
  }

  // Only same-site absolute paths are safe redirect targets.
  function safeNext(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
      ? value : "";
  }

  return {
    userFromRequest,
    csrfFor,
    assertCsrf,

    async signupPage(ctx) {
      return html(signupForm("", String(ctx.query.get("next") ?? "")));
    },

    async signupSubmit({ form }) {
      const email = String(form.email ?? "").trim().toLowerCase();
      const password = String(form.password ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return html(signupForm("Enter a valid email address.", email));
      if (password.length < 10)
        return html(signupForm("Password must be at least 10 characters.", email));
      if (await store.users.byEmail(email))
        return html(signupForm("An account with that email already exists.", email));

      await store.users.create(randomHex(16), email, await hashPassword(password));
      return startSession((await store.users.byEmail(email)).id, safeNext(form.next));
    },

    async loginPage(ctx) {
      return html(loginForm("", safeNext(ctx.query.get("next"))));
    },

    async loginSubmit(ctx) {
      const email = String(ctx.form.email ?? "").trim().toLowerCase();
      const user = await store.users.byEmail(email);
      const ok = user && await verifyPassword(String(ctx.form.password ?? ""), user.pw_hash);
      if (!ok) return html(loginForm("Wrong email or password."));
      return startSession(user.id, safeNext(ctx.form.next));
    },

    async logoutSubmit(ctx) {
      if (!await assertCsrf(ctx.request, ctx.form))
        return html("<p>Invalid request.</p>", 400);
      const token = parseCookies(ctx.request).bf_session;
      if (token) await store.sessions.destroy(await sha256Hex(token));
      return redirect("/", { "set-cookie": clearSessionCookie() });
    },
  };
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}
