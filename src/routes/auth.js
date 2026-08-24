import { html, parseCookies, sessionCookie, clearSessionCookie, redirect } from "../lib/http.js";
import { randomHex, sha256Hex, hmacHex, hashPassword, verifyPassword, timingSafeEqual } from "../lib/crypto.js";
import {
  mintState, verifyState, claimsFailureReason, claimsToIdentity, exchangeCode,
} from "../lib/oauth.js";
import { createStore } from "../lib/store.js";
import { signupForm, loginForm, logoutConfirm } from "../pages.js";

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

  function ssoConfigured() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  // ---- Google SSO ----------------------------------------------------------

  async function googleStart(ctx) {
    if (!ssoConfigured()) {
      return html(`<h1>Google sign-in not configured</h1>
        <p class="muted">Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. See
        <a href="https://github.com/stevekkall-beansgc/beanfit-app/blob/main/GOOGLE-SSO.md">GOOGLE-SSO.md</a>.</p>`,
        503);
    }
    const origin = new URL(ctx.request.url).origin;
    const { state, nonce } = await mintState(env.SESSION_SECRET, safeNext(ctx.query.get("next")));
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${origin}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      prompt: "select_account",
    });
    return redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      { "set-cookie": `bf_oauth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` },
    );
  }

  async function googleCallback(ctx) {
    if (!ssoConfigured()) return html("<p>Google sign-in is not configured.</p>", 503);
    const url = new URL(ctx.request.url);

    const err = ctx.query.get("error");
    if (err) return html(loginForm(`Google sign-in was cancelled (${err}).`));

    const cookieState = parseCookies(ctx.request).bf_oauth;
    const queryState = ctx.query.get("state") ?? "";
    if (!cookieState || !timingSafeEqual(cookieState, queryState)) {
      return html(loginForm("Sign-in could not be verified (state mismatch). Try again."));
    }
    const verified = await verifyState(env.SESSION_SECRET, queryState);
    if (!verified) return html(loginForm("Sign-in expired. Try again."));

    const code = ctx.query.get("code");
    if (!code) return html(loginForm("Missing authorization code."));

    const origin = url.origin;
    const { status, body } = await exchangeCode(
      { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      code, `${origin}/auth/google/callback`,
    );
    if (status !== 200 || typeof body.id_token !== "string") {
      console.error("token exchange failed", status, body.error ?? "");
      return html(loginForm("Google sign-in failed. Try again."));
    }
    let claims;
    try { claims = JSON.parse(atob(body.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch { return html(loginForm("Invalid token from Google.")); }
    const reason = claimsFailureReason(claims, env.GOOGLE_CLIENT_ID, verified.nonce);
    if (reason) {
      console.error("google claims rejected:", reason);
      return html(loginForm("Google sign-in failed validation. Try again."));
    }
    const identity = claimsToIdentity(claims);

    // 1. Known identity → straight in.
    const known = await store.identities.find(identity.provider, identity.uid);
    if (known) return startSession(known.user_id, verified.path);

    // 2. Same email → link identity to the existing account.
    const byEmail = await store.users.byEmail(identity.email);
    if (byEmail) {
      await store.identities.create(identity.provider, identity.uid, byEmail.id, identity.email);
      return startSession(byEmail.id, verified.path);
    }

    // 3. New user (passwordless — Google owns the credential).
    const userId = randomHex(16);
    await store.users.create(userId, identity.email, "");
    await store.identities.create(identity.provider, identity.uid, userId, identity.email);
    return startSession(userId, verified.path || "/dashboard");
  }

  return {
    userFromRequest,
    csrfFor,
    assertCsrf,
    googleStart,
    googleCallback,

    async signupPage(ctx) {
      return html(signupForm("", "", safeNext(ctx.query.get("next")), ssoConfigured()));
    },

    async signupSubmit(ctx) {
      const form = ctx.form;
      const email = String(form.email ?? "").trim().toLowerCase();
      const password = String(form.password ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return html(signupForm("Enter a valid email address.", email));
      if (password.length < 10)
        return html(signupForm("Password must be at least 10 characters.", email, safeNext(form.next), ssoConfigured()));
      if (await store.users.byEmail(email))
        return html(signupForm("An account with that email already exists.", email, safeNext(form.next), ssoConfigured()));

      await store.users.create(randomHex(16), email, await hashPassword(password));
      return startSession((await store.users.byEmail(email)).id, safeNext(form.next));
    },

    async loginPage(ctx) {
      return html(loginForm("", safeNext(ctx.query.get("next")), ssoConfigured()));
    },

    async loginSubmit(ctx) {
      const email = String(ctx.form.email ?? "").trim().toLowerCase();
      const user = await store.users.byEmail(email);
      if (user && !user.pw_hash)
        return html(loginForm("This account signs in with Google.", safeNext(ctx.form.next), ssoConfigured()));
      const ok = user && await verifyPassword(String(ctx.form.password ?? ""), user.pw_hash);
      if (!ok) return html(loginForm("Wrong email or password.", "", ssoConfigured()));
      return startSession(user.id, safeNext(ctx.form.next));
    },

    async logoutPage(ctx) {
      return html(logoutConfirm(ctx.user, await csrfFor(ctx.request)));
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

