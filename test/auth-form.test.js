import test from "node:test";
import assert from "node:assert/strict";

import { authForm } from "../src/pages.js";

test("signup form: passwordless-safe attributes and no Google button when SSO off", () => {
  const html = authForm("signup", { error: "Enter a valid email address.", email: "a@b.co" });
  assert.match(html, /action="\/signup"/);
  assert.match(html, /minlength="10"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /value="a@b\.co"/);
  assert.ok(!html.includes("Continue with Google"), "SSO off must not render Google button");
});

test("login form: Google button visible to passwordless users on every error path", () => {
  // Regression: seven OAuth cancel/error pages dropped the button entirely.
  for (const error of [
    "Google sign-in was cancelled (access_denied).",
    "Sign-in could not be verified (state mismatch). Try again.",
    "Sign-in expired. Try again.",
    "Missing authorization code.",
    "Google sign-in failed. Try again.",
    "Invalid token from Google.",
    "Google sign-in failed validation. Try again.",
  ]) {
    const html = authForm("login", { error, sso: true });
    assert.match(html, /Continue with Google/, `missing button for: ${error}`);
    assert.match(html, /Signed up with Google\? You don't have a password/);
  }
});

test("login form without SSO states the honest fact instead of asserting linkage", () => {
  const html = authForm("login", { error: "Password sign-in isn't set up for this account.", sso: false });
  assert.ok(!html.includes("signs in with Google"));
  assert.match(html, /Password sign-in isn&#39;t set up/);
});

test("deep-link next survives re-renders into hidden input, SSO link, and footer", () => {
  const html = authForm("signup", { email: "x@y.io", next: "/devices/d1", sso: true });
  assert.match(html, /name="next" value="\/devices\/d1"/);
  assert.match(html, /\/auth\/google\/start\?next=%2Fdevices%2Fd1/);
  assert.match(html, /href="\/login\?next=%2Fdevices%2Fd1"/);
});
