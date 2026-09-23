import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { configureDevice } from "../src/browser/configurator.js";
import { registerBrowser } from "../src/browser/register.js";
import { html, json } from "../src/lib/http.js";
import { dashboard, deviceDetail } from "../src/pages.js";

function directive(policy, name) {
  return policy.split(";")
    .map(part => part.trim())
    .find(part => part === name || part.startsWith(`${name} `));
}

function device(id = "d1") {
  return {
    id, label: "Test Mac", chip: "Apple M4", os: "macOS",
    model_budget_gib: 12, approved_at: "2026-09-23",
  };
}

test("HTML CSP allows only same-origin scripts and current pages use fixed script endpoints", async () => {
  const registration = html(dashboard({ id: "u1", email: "user@example.com" }, []));
  const configurator = html(deviceDetail(device(), null, { id: "u1", email: "user@example.com" }));
  const registrationBody = await registration.text();
  const configuratorBody = await configurator.text();

  for (const response of [registration, configurator]) {
    const policy = response.headers.get("content-security-policy");
    assert.equal(directive(policy, "default-src"), "default-src 'none'");
    assert.equal(directive(policy, "base-uri"), "base-uri 'none'");
    assert.equal(directive(policy, "connect-src"), "connect-src 'self'");
    assert.equal(directive(policy, "form-action"), "form-action 'self'");
    assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
    assert.equal(directive(policy, "object-src"), "object-src 'none'");
    assert.equal(directive(policy, "script-src"), "script-src 'self'");
    assert.equal(directive(policy, "script-src-attr"), "script-src-attr 'none'");
    assert.equal(directive(policy, "style-src"), "style-src 'unsafe-inline'");
    assert.equal(policy.match(/'unsafe-inline'/g)?.length, 1);
    assert.doesNotMatch(policy, /nonce-|strict-dynamic|unsafe-eval/);
  }

  assert.deepEqual(
    registrationBody.match(/<script\b[^>]*>/g),
    [`<script src="/assets/register.js" defer>`],
  );
  assert.match(registrationBody, /id="register-browser"/);
  assert.match(registrationBody, /id="copy-cmds"/);
  assert.deepEqual(
    configuratorBody.match(/<script\b[^>]*>/g),
    [`<script src="/assets/configurator.js" defer>`],
  );
  assert.match(configuratorBody, /id="gen-stack"/);
  assert.match(configuratorBody, /id="stack-config" data-device-id="d1"/);
});

test("HTML helper performs no trust-granting rewrite for injected markers or scripts", async () => {
  const injected = [
    `<script data-beanfit-app>alert("marker")</script>`,
    `<script>alert("inline")</script>`,
    `<script src="https://evil.example/payload.js"></script>`,
    `<script src="/assets/not-fixed.js"></script>`,
  ].join("");
  const response = html(injected);
  const body = await response.text();
  const policy = response.headers.get("content-security-policy");

  assert.equal(body, injected);
  assert.equal(directive(policy, "script-src"), "script-src 'self'");
  assert.doesNotMatch(directive(policy, "script-src"), /nonce-|unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(body, /<script[^>]*nonce=/);
});

test("configurator device ID is escaped outside executable script source", async () => {
  const hostileId = `d1"><script>alert(1)</script><span data-owned="yes`;
  const body = await html(
    deviceDetail(device(hostileId), null, { id: "u1", email: "user@example.com" }),
  ).text();

  assert.match(
    body,
    /id="stack-config" data-device-id="d1&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;&lt;span data-owned=&quot;yes"/,
  );
  assert.doesNotMatch(body, /<script>alert\(1\)<\/script>/);
});

test("fixed browser behavior is routable from checked-in source modules", async () => {
  const env = { DB: {} };
  const cases = [
    ["/assets/register.js", registerBrowser, 'document.getElementById("register-browser")'],
    ["/assets/configurator.js", configureDevice, 'root.getAttribute("data-device-id")'],
  ];

  for (const [path, sourceFunction, requiredText] of cases) {
    const response = await worker.fetch(new Request(`https://app.example${path}`), env);
    const source = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/javascript; charset=utf-8");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(source, `(${sourceFunction.toString()})();\n`);
    assert.ok(source.includes(requiredText));
    assert.doesNotThrow(() => new Function(source));
  }

  const configurator = await worker.fetch(
    new Request("https://app.example/assets/configurator.js"), env,
  );
  const source = await configurator.text();
  assert.ok(source.includes('encodeURIComponent(deviceId)'));
  assert.ok(source.includes('fetch("/api/devices/" + encodeURIComponent(deviceId) + "/stack"'));

  const missing = await worker.fetch(
    new Request("https://app.example/assets/not-fixed.js"), env,
  );
  assert.equal(missing.status, 404);
});

test("HTML security headers cannot be overridden and do not leak onto JSON responses", async () => {
  const page = html("<p>ok</p>", 201, {
    "content-security-policy": "default-src *",
    "x-test-header": "kept",
  });
  assert.equal(page.status, 201);
  assert.equal(await page.text(), "<p>ok</p>");
  assert.notEqual(page.headers.get("content-security-policy"), "default-src *");
  assert.equal(page.headers.get("x-test-header"), "kept");
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(page.headers.get("cache-control"), "no-store, must-revalidate");

  const api = json({ ok: true });
  assert.equal(api.headers.get("content-security-policy"), null);
  assert.equal(api.headers.get("content-type"), "application/json");
  assert.equal(api.headers.get("cache-control"), "no-store");
});
