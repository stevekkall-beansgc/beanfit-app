import { hmacHex } from "./crypto.js";
import { html, json } from "./http.js";

const RETRY_AFTER = { "retry-after": "60" };

export async function checkRateLimit(request, env, bindingName, api = false) {
  if (env.ENVIRONMENT === "dev") return null;

  let limiter;
  let result;
  try {
    limiter = env[bindingName];
    const secret = env.SESSION_SECRET;
    const ip = request.headers.get("CF-Connecting-IP")?.trim() ?? "";
    if (typeof secret !== "string" || secret === "" || ip === ""
        || typeof limiter?.limit !== "function") {
      return unavailable(api);
    }
    const key = await hmacHex(secret, `rate-limit:${bindingName}:${ip}`);
    result = await limiter.limit({ key });
  } catch {
    return unavailable(api);
  }

  if (result?.success === false) return exceeded(api);
  if (result?.success !== true) return unavailable(api);
  return null;
}

function exceeded(api) {
  if (api) return json({ error: "rate_limit_exceeded" }, 429, RETRY_AFTER);
  return html("<p>Too many requests. Try again in 60 seconds.</p>", 429, RETRY_AFTER);
}

function unavailable(api) {
  if (api) return json({ error: "rate_limit_unavailable" }, 503, RETRY_AFTER);
  return html("<p>Request protection is temporarily unavailable. Try again later.</p>", 503, RETRY_AFTER);
}
