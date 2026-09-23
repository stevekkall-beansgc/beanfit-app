import { html, parseCookies, sessionCookie, clearSessionCookie, redirect } from "../lib/http.js";
import { randomHex, sha256Hex, hmacHex, hashPassword, verifyPassword, timingSafeEqual } from "../lib/crypto.js";
import {
  mintState, verifyState, claimsFailureReason, claimsToIdentity, exchangeCode,
} from "../lib/oauth.js";
import { makeGoogleJwksVerifier } from "../lib/jwks.js";
import { createStore } from "../lib/store.js";
import { authForm, logoutConfirm, linkStatus } from "../pages.js";

// deps: { store, exchange, verifyGoogleToken, fetch } exist only so tests can
// drive the decision tree without D1 or Google. Production callers
// (src/index.js) pass nothing; verifyGoogleToken then becomes the live
// pinned-URL Google JWKS RS256 verifier.
export function makeAuthHandlers(env, deps = {}) {
  const store = deps.store ?? createStore(env.DB);
  const exchange = deps.exchange ?? exchangeCode;
  // Signature gate for Google id_tokens: fails closed on missing/failed key
  // fetch, unknown kid, malformed JWT, bad signature. Runs before any claim
  // is trusted and before any identity/session work.
  const verifyGoogleToken = deps.verifyGoogleToken
    ?? makeGoogleJwksVerifier({ fetchImpl: deps.fetch }).verify;

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

  // Shown when a sign-in attempt's verified Google email matches an account
  // it is NOT linked to. Matching email alone never links and never signs in.
  function emailTakenNotice() {
    return html(authForm("login", {
      error: "An account with that email already exists. Sign in with your password first, then link Google from your dashboard.",
      sso: ssoConfigured(),
    }));
  }

  // ---- Google SSO ----------------------------------------------------------

  function googleAuthRedirect(origin, state, nonce) {
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

  async function googleStart(ctx) {
    if (!ssoConfigured()) {
      return html(`<h1>Google sign-in not configured</h1>
        <p class="muted">Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. See
        <a href="https://github.com/stevekkall-beansgc/beanfit-app/blob/main/GOOGLE-SSO.md">GOOGLE-SSO.md</a>.</p>`,
        503);
    }
    const origin = new URL(ctx.request.url).origin;
    const { state, nonce } = await mintState(env.SESSION_SECRET, safeNext(ctx.query.get("next")));
    return googleAuthRedirect(origin, state, nonce);
  }

  // Explicit linking initiation. The route table owns the auth gate
  // (POST /auth/google/link = "required"); CSRF is enforced here. The minted
  // state binds the eventual callback to THIS user + THIS session credential.
  async function googleLinkStart(ctx) {
    if (!ssoConfigured()) {
      return html("<p>Google sign-in is not configured.</p>", 503);
    }
    // Fail closed if invoked without a resolved session (route flag normally
    // guarantees this; a null user must never mint link-bound state).
    if (!ctx.user) return html("<p>Invalid request.</p>", 400);
    if (!await assertCsrf(ctx.request, ctx.form ?? {}))
      return html("<p>Invalid request.</p>", 400);
    const sessionToken = parseCookies(ctx.request).bf_session;
    if (!sessionToken) return html("<p>Invalid request.</p>", 400);
    const origin = new URL(ctx.request.url).origin;
    const { state, nonce } = await mintState(
      env.SESSION_SECRET, "/dashboard?linked=google", 600,
      { uid: ctx.user.id, sid: await sha256Hex(sessionToken) },
    );
    return googleAuthRedirect(origin, state, nonce);
  }

  // Completes a link-mode callback. Every failure is fail-closed: no
  // identity row is written, no session is issued or changed.
  async function completeGoogleLink(ctx, identity, state) {
    const bound = state.link;
    const fail = (message) => html(linkStatus(false, message, ctx.user ?? null), 403);

    const sessionToken = parseCookies(ctx.request).bf_session;
    if (!ctx.user || !sessionToken)
      return fail("Linking requires your signed-in session. Start again from your dashboard.");
    const sid = await sha256Hex(sessionToken);
    if (!timingSafeEqual(sid, bound.sid) || !timingSafeEqual(ctx.user.id, bound.uid))
      return fail("Your session changed during linking. Start again from your dashboard.");

    const known = await store.identities.find(identity.provider, identity.uid);
    if (known && known.user_id !== bound.uid)
      return fail("That Google account is already linked to a different account.");
    if (!known) {
      try {
        await store.identities.create(
          identity.provider, identity.uid, bound.uid, identity.email);
      } catch {
        // UNIQUE race: someone linked this identity first — re-find and
        // accept only if it landed on the same bound user; otherwise reject.
        const raced = await store.identities.find(identity.provider, identity.uid);
        if (!raced) return fail("Could not link that Google account. Try again.");
        if (raced.user_id !== bound.uid)
          return fail("That Google account is already linked to a different account.");
      }
    }
    return redirect(state.path || "/dashboard");
  }

  async function googleCallback(ctx) {
    if (!ssoConfigured()) return html("<p>Google sign-in is not configured.</p>", 503);
    const url = new URL(ctx.request.url);

    const err = ctx.query.get("error");
    if (err) return html(authForm("login", { error: `Google sign-in was cancelled (${err}).`, sso: ssoConfigured() }));

    const cookieState = parseCookies(ctx.request).bf_oauth;
    const queryState = ctx.query.get("state") ?? "";
    if (!cookieState || !timingSafeEqual(cookieState, queryState)) {
      return html(authForm("login", { error: "Sign-in could not be verified (state mismatch). Try again.", sso: ssoConfigured() }));
    }
    const state = await verifyState(env.SESSION_SECRET, queryState);
    if (!state) return html(authForm("login", { error: "Sign-in expired. Try again.", sso: ssoConfigured() }));

    const code = ctx.query.get("code");
    if (!code) return html(authForm("login", { error: "Missing authorization code.", sso: ssoConfigured() }));

    const origin = url.origin;
    const { status, body } = await exchange(
      { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
      code, `${origin}/auth/google/callback`,
    );
    if (status !== 200 || typeof body.id_token !== "string") {
      console.error("token exchange failed", status, body.error ?? "");
      return html(authForm("login", { error: "Google sign-in failed. Try again.", sso: ssoConfigured() }));
    }

    // Signature gate BEFORE any claim is trusted and BEFORE any identity or
    // session work: verified token payload or fail closed. Google's RS256
    // key material comes only from the pinned discovery/JWKS endpoints.
    const jwt = await verifyGoogleToken(body.id_token);
    if (!jwt.ok) {
      console.error("google token rejected:", jwt.reason);
      return html(authForm("login", { error: "Google sign-in failed validation. Try again.", sso: ssoConfigured() }));
    }
    const reason = claimsFailureReason(jwt.claims, env.GOOGLE_CLIENT_ID, state.nonce);
    if (reason) {
      console.error("google claims rejected:", reason);
      return html(authForm("login", { error: "Google sign-in failed validation. Try again.", sso: ssoConfigured() }));
    }
    const identity = claimsToIdentity(jwt.claims);

    // Explicit linking flow: state was minted by POST /auth/google/link,
    // bound to one authenticated session. Complete only for that session.
    if (state.link) return completeGoogleLink(ctx, identity, state);

    // Sign-in flow.
    // 1. Known identity → straight in (already-linked Google sign-in).
    const known = await store.identities.find(identity.provider, identity.uid);
    if (known) return startSession(known.user_id, state.path);

    // 2. Same email does NOT link and does NOT sign in. Fail closed and
    //    point at the explicit, session-bound linking path instead of taking
    //    the existing account over.
    if (await store.users.byEmail(identity.email)) return emailTakenNotice();

    // 3. New user (passwordless — Google owns the credential). One atomic
    //    write; a UNIQUE race re-checks identity first (a concurrent callback
    //    for THIS identity may have won), then email — never linking on
    //    email match alone.
    const userId = randomHex(16);
    try {
      await store.users.createWithIdentity(
        { id: userId, email: identity.email, pwHash: "" },
        { provider: identity.provider, providerUid: identity.uid, userId, emailAtLink: identity.email },
      );
    } catch (e) {
      const won = await store.identities.find(identity.provider, identity.uid);
      if (won) return startSession(won.user_id, state.path || "/dashboard");
      if (await store.users.byEmail(identity.email)) return emailTakenNotice();
      console.error("signup create failed", e);
      return html(authForm("login", { error: "Could not create your account. Try again.", sso: ssoConfigured() }));
    }
    return startSession(userId, state.path || "/dashboard");
  }

  return {
    userFromRequest,
    csrfFor,
    assertCsrf,
    googleStart,
    googleLinkStart,
    googleCallback,

    async signupPage(ctx) {
      return html(authForm("signup", { next: safeNext(ctx.query.get("next")), sso: ssoConfigured() }));
    },

    async signupSubmit(ctx) {
      const form = ctx.form;
      const email = String(form.email ?? "").trim().toLowerCase();
      const password = String(form.password ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return html(authForm("signup", { error: "Enter a valid email address.", email, next: safeNext(form.next), sso: ssoConfigured() }));
      if (password.length < 10)
        return html(authForm("signup", { error: "Password must be at least 10 characters.", email, next: safeNext(form.next), sso: ssoConfigured() }));
      if (await store.users.byEmail(email))
        return html(authForm("signup", { error: "An account with that email already exists.", email, next: safeNext(form.next), sso: ssoConfigured() }));

      await store.users.create(randomHex(16), email, await hashPassword(password));
      return startSession((await store.users.byEmail(email)).id, safeNext(form.next));
    },

    async loginPage(ctx) {
      return html(authForm("login", { next: safeNext(ctx.query.get("next")), sso: ssoConfigured() }));
    },

    async loginSubmit(ctx) {
      const email = String(ctx.form.email ?? "").trim().toLowerCase();
      const user = await store.users.byEmail(email);
      if (user && !user.pw_hash)
        return html(authForm("login", {
          error: ssoConfigured()
            ? "This account signs in with Google."
            : "Password sign-in isn't set up for this account.",
          next: safeNext(ctx.form.next),
          sso: ssoConfigured(),
        }));
      const ok = user && await verifyPassword(String(ctx.form.password ?? ""), user.pw_hash);
      if (!ok) return html(authForm("login", { error: "Wrong email or password.", sso: ssoConfigured() }));
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

