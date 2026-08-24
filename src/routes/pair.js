import { html, json, redirect } from "../lib/http.js";
import { randomHex, pairingCode, sha256Hex } from "../lib/crypto.js";
import { createStore } from "../lib/store.js";
import { sanitizeProfile, sanitizeRanked } from "../lib/fit.js";
import {
  landing, dashboard, pairConfirm, pairDone,
  pairLookupForm, deviceDetail, renderStack, stackForm,
} from "../pages.js";
import { generateStack } from "../lib/stack.js";

const PAIR_TTL = 15 * 60;

export function makePageHandlers(env, auth) {
  const store = createStore(env.DB);

  return {
    async landing(ctx) {
      return html(landing(ctx.user));
    },

    async dashboard({ user }) {
      const devices = await store.devices.listForUser(user.id);
      return html(dashboard(user, devices));
    },

    async deviceDetail(ctx) {
      const device = await store.devices.getForUser(ctx.params.id, ctx.user.id);
      if (!device) return new Response("Not found", { status: 404 });
      const rec = await store.recommendations.forDevice(device.id);
      const stack = device.stack_json ? JSON.parse(device.stack_json) : null;
      return html(deviceDetail(device, rec, ctx.user, stack));
    },

    // Generate (and persist) the user's stack. Returns an HTML fragment so
    // the page can swap it in without a client-side renderer.
    async generateStackRoute(ctx) {
      const device = await store.devices.getForUser(ctx.params.id, ctx.user.id);
      if (!device) return new Response("Not found", { status: 404 });
      let body = {};
      try { body = await ctx.request.json(); } catch { /* defaults */ }
      const rec = await store.recommendations.forDevice(device.id);
      const stack = generateStack(device, {
        surfaces: body.surfaces,
        model_tag: body.model_tag,
      });
      await store.devices.setStack(device.id, JSON.stringify(stack));
      return html(renderStack(stack));
    },

    // /pair            -> lookup form (signed in; router flag owns the gate)
    // /pair?code=XXXX  -> confirm page
    async pairLookup(ctx) {
      const code = String(ctx.query.get("code") ?? "").toUpperCase();
      if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code)) return html(pairLookupForm("", ctx.user));
      return pairConfirmPage(ctx, code);
    },

    async pairConfirmRoute(ctx) {
      return pairConfirmPage(ctx, ctx.params.code.toUpperCase());
    },

    async pairApprove(ctx) {
      const form = ctx.form ?? {};
      if (!await auth.assertCsrf(ctx.request, form)) return html("<p>Invalid request.</p>", 400);
      const device = await store.devices.pendingByCode(
        ctx.params.code.toUpperCase(), Math.floor(Date.now() / 1000));
      if (!device)
        return html(pairDone(false, "Invalid or expired code. Run `beanfit register` again.", ctx.user));
      const token = randomHex(24);
      // approve() carries the status='pending' guard; a concurrent approver
      // wins the row and ours matches zero rows — never overwrite their token.
      const res = await store.devices.approve(device.id, ctx.user.id, await sha256Hex(token), token);
      if (!res?.meta?.changes)
        return html(pairDone(false, "Invalid or expired code. Run `beanfit register` again.", ctx.user));
      return html(pairDone(true,
        `"${(form.label || device.label).slice(0, 64)}" is registered. Your terminal now has your recommendations.`, ctx.user));
    },

    async pairDeny(ctx) {
      const form = ctx.form ?? {};
      if (!await auth.assertCsrf(ctx.request, form)) return html("<p>Invalid request.</p>", 400);
      const device = await store.devices.pendingByCode(
        ctx.params.code.toUpperCase(), Math.floor(Date.now() / 1000));
      if (device) await store.devices.denyPending(device.id);
      return html(pairDone(false, "Device denied. Nothing was registered.", ctx.user));
    },
  };

  async function pairConfirmPage(ctx, code) {
    const device = await store.devices.pendingByCode(code, Math.floor(Date.now() / 1000));
    if (!device)
      return html(pairDone(false, "That pairing code is invalid or expired. Run `beanfit register` again.", ctx.user));
    const rec = await store.recommendations.forDevice(device.id);
    return html(
      pairConfirm(ctx.user, device, await auth.csrfFor(ctx.request), rec?.payload_json ?? null),
    );
  }
}

export function makePairApiHandlers(env) {
  const store = createStore(env.DB);

  return {
    // CLI -> POST /api/pair/start
    async start({ request }) {
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      const profile = sanitizeProfile(body.profile);
      if (!profile?.chip) return json({ error: "profile.hardware missing or invalid" }, 422);

      const id = randomHex(16), pairId = randomHex(12), code = pairingCode();
      await store.devices.createPending({
        id,
        label: String(body.label ?? profile.chip).slice(0, 64),
        pair_code: code,
        pair_id: pairId,
        pair_expires_at: Math.floor(Date.now() / 1000) + PAIR_TTL,
        ...profile,
      });
      if (body.recommendations) {
        const r = body.recommendations;
        await store.recommendations.upsert(
          id,
          String(r.use_case ?? "chat").slice(0, 16),
          String(r.engine_version ?? "").slice(0, 24),
          JSON.stringify({ use_case: r.use_case, ranked: sanitizeRanked(r.ranked) }),
        );
      }
      return json({ pair_id: pairId, code, expires_in: PAIR_TTL }, 201);
    },

    // CLI -> GET /api/pair/status/:pairId (poll until approved/denied/expired)
    async status({ params }) {
      const device = await store.devices.byPairId(params.pairId);
      if (!device) return json({ error: "unknown pair_id" }, 404);
      if (device.status === "pending" && expired(device)) return json({ status: "expired" });
      if (device.status === "approved")
        return json({
          status: "approved", device_id: device.id,
          device_token: device.device_token ?? null,
        });
      return json({ status: device.status });
    },
  };
}

function expired(device) {
  return !device.pair_expires_at || device.pair_expires_at < Math.floor(Date.now() / 1000);
}
