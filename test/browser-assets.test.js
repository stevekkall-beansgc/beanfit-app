import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

// Use the bundler installed by our locked Wrangler, including its keepNames
// transformation. Parsing unbundled Function.toString() output misses closures
// over bundler helpers that do not exist in the browser.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const minify of [false, true]) {
  test(`bundled browser assets execute independently (minify=${minify})`, async () => {
    const bundle = await build({
      entryPoints: [new URL("../src/routes/assets.js", import.meta.url).pathname],
      bundle: true, write: false, format: "esm", platform: "browser",
      keepNames: true, minify,
    });
    const { makeAssetHandlers } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    const handlers = makeAssetHandlers();

    const registerClicks = {};
    const registerButton = { addEventListener: (name, fn) => { registerClicks[name] = fn; } };
    const status = {};
    const registerRequests = [];
    runInNewContext(await handlers.register().text(), {
      document: {
        getElementById: id => ({ "register-browser": registerButton, "register-status": status }[id]),
        createElement: () => ({ getContext: () => null }),
      },
      navigator: { platform: "Synthetic browser", deviceMemory: 16 },
      fetch: async (url, options) => {
        registerRequests.push({ url, body: JSON.parse(options.body) });
        return { json: async () => ({ error: "synthetic refusal" }) };
      },
    });
    assert.equal(typeof registerClicks.click, "function");
    registerClicks.click();
    await flush();
    assert.equal(registerRequests[0].url, "/api/pair/start");
    assert.equal(registerRequests[0].body.profile.hardware.chip, "Synthetic browser");
    assert.equal(registerRequests[0].body.profile.hardware.ram_gib, 16);
    assert.equal(registerButton.disabled, false);
    assert.match(status.textContent, /synthetic refusal/);

    const clicks = {}, button = { addEventListener: (name, fn) => { clicks[name] = fn; } };
    let surfaces = [], refuse = false;
    const result = {}, alerts = [], requests = [];
    const root = {
      getAttribute: () => "synthetic/id",
      querySelectorAll: () => surfaces,
      querySelector: () => ({ value: "qwen3:8b" }),
    };
    runInNewContext(await handlers.configurator().text(), {
      document: {
        getElementById: id => ({ "stack-config": root, "gen-stack": button, "stack-result": result }[id]),
        querySelectorAll: () => [],
      },
      alert: message => alerts.push(message),
      fetch: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        if (refuse) throw new Error("synthetic network refusal");
        return { text: async () => '<section id="stack-output">synthetic setup</section>' };
      },
    });
    clicks.click();
    assert.deepEqual(alerts, ["Pick at least one thing to do"]);
    assert.equal(requests.length, 0);
    surfaces = [{ value: "chat_terminal" }];
    clicks.click();
    await flush();
    assert.deepEqual(requests[0], {
      url: "/api/devices/synthetic%2Fid/stack",
      body: { surfaces: ["chat_terminal"], model_tag: "qwen3:8b" },
    });
    assert.match(result.innerHTML, /synthetic setup/);
    assert.equal(button.disabled, false);
    refuse = true;
    clicks.click();
    await flush();
    assert.match(result.innerHTML, /Could not build your setup/);
    assert.equal(button.disabled, false);
    refuse = false;
    clicks.click();
    await flush();
    assert.match(result.innerHTML, /synthetic setup/);
    assert.equal(button.disabled, false);
  });
}
