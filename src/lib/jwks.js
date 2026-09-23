// Google OIDC id_token signature verification (RS256 via Web Crypto) with
// key material fetched from pinned, trusted Google endpoints only, and
// bound, cache-header-aware key caching. Zero-dependency; runs on Workers
// and Node 22 (crypto.subtle + fetch).
//
// Fail-closed contract: every failure path returns { ok: false }. A caller
// MUST treat any { ok: false } as "the token is not authenticated by Google"
// and MUST NOT create an identity, session, or link from it.

const enc = new TextEncoder();

export const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const DEFAULT_TTL_MS = 5 * 60 * 1000;  // 5 min when the response carries no cache signal
const MAX_TTL_MS = 60 * 60 * 1000;     // never trust cached keys beyond an hour
const MAX_KEYS = 10;                   // rotation sets are small; refuse oversized sets
const FETCH_TIMEOUT_MS = 10 * 1000;

// The only jwks_uri values we will ever fetch, whether from the pinned
// discovery URL or from code config. Anything else is refused: no arbitrary
// jwks_uri, and no URL supplied inside a token (JWTs never override this).
const ALLOWED_JWKS_HOSTS = new Set([
  "accounts.google.com",
  "www.google.com",
  "www.googleapis.com",
  "oauth2.googleapis.com",
  "openidconnect.googleapis.com",
]);

function b64urlToBytes(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseJwt(token) {
  if (typeof token !== "string") throw new TypeError("jwt must be a string");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt: expected 3 segments");
  const [headB64, payB64, sigB64] = parts;
  if (!headB64 || !payB64 || !sigB64) throw new Error("malformed jwt: empty segment");
  let header, payload, sigBytes;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headB64)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payB64)));
    sigBytes = b64urlToBytes(sigB64);
  } catch {
    throw new Error("malformed jwt: unparseable segment");
  }
  return { header, payload, headB64, payB64, sigB64, sigBytes };
}

function trustedJwksUrl(u) {
  let parsed;
  try { parsed = new URL(u); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_JWKS_HOSTS.has(host)
    || host.endsWith(".googleapis.com")
    || host.endsWith(".google.com");
}

function cacheTtlMs(resp, nowMs) {
  const cc = String(resp.headers.get("cache-control") ?? "");
  if (/\bno-store\b|\bno-cache\b/.test(cc)) return 0;
  const m = /\bmax-age=(\d+)\b/.exec(cc);
  if (m) return Math.min(Number(m[1]) * 1000, MAX_TTL_MS);
  const expires = resp.headers.get("expires");
  if (expires) {
    const t = Date.parse(expires);
    if (!Number.isNaN(t)) return Math.min(Math.max(t - nowMs, 0), MAX_TTL_MS);
  }
  return DEFAULT_TTL_MS;
}

// Returns { kid, jwk } for a usable RS256 signing key, or null. Strict:
  // non-RSA keys, encryption keys, non-RS256 algs, and implausible RSA
  // moduli are all skipped (a set with nothing usable fails closed).
  // Malformed JWK data (invalid base64, missing fields, wrong types) fails closed.
  function usableJwkKey(jwk) {
    if (!jwk || typeof jwk !== "object") return null;
    if (jwk.kty !== "RSA") return null;
    if (jwk.use && jwk.use !== "sig") return null;
    if (jwk.alg && jwk.alg !== "RS256") return null;
    if (typeof jwk.kid !== "string" || jwk.kid === "") return null;
    if (typeof jwk.n !== "string" || jwk.n === "" || typeof jwk.e !== "string" || jwk.e !== "AQAB") return null;
    let nBytes;
    try {
      nBytes = b64urlToBytes(jwk.n.replace(/=+$/, ""));
    } catch {
      return null;
    }
    if (nBytes.length < 256 || nBytes.length > 512) return null;
    return { kid: jwk.kid, jwk: { kty: "RSA", use: "sig", alg: "RS256", kid: jwk.kid, n: jwk.n, e: jwk.e } };
  }

export function makeGoogleJwksVerifier({
  fetchImpl = fetch,
  discoveryUrl = GOOGLE_DISCOVERY_URL,
  jwksUrl = GOOGLE_JWKS_URL,
  now = () => Date.now(),
} = {}) {
  let set = null;          // [{ kid, jwk }] — the CACHED, validated signing set
  let setLoadedAtMs = 0;
  let setTtlMs = 0;
  let inflight = null;

  async function safeFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetchImpl(url, { signal: controller.signal, redirect: "error" });
      return resp && resp.ok ? resp : null;
    } catch {
      return null; // DNS/TLS/abort/5xx/redirect all land here: fail closed
    } finally {
      clearTimeout(timer);
    }
  }

  async function retrieveKeys() {
    // 1. Discovery from the pinned endpoint only. Its jwks_uri must be a
    //    trusted Google host — an arbitrary or attacker-chosen value is
    //    refused without ever being fetched.
    let target = jwksUrl;
    if (discoveryUrl) {
      const resp = await safeFetch(discoveryUrl);
      if (!resp) return null;
      let doc;
      try { doc = await resp.json(); } catch { return null; }
      const uri = doc?.jwks_uri;
      if (typeof uri !== "string" || !trustedJwksUrl(uri)) return null;
      target = uri;
    }

    // 2. Fetch the JWKS from that verified URL.
    const resp = await safeFetch(target);
    if (!resp) return null;
    const ttlMs = cacheTtlMs(resp, now());
    let doc;
    try { doc = await resp.json(); } catch { return null; }
    if (!Array.isArray(doc?.keys) || doc.keys.length === 0 || doc.keys.length > MAX_KEYS) return null;

    const out = [];
    for (const key of doc.keys) {
      const usable = usableJwkKey(key);
      if (usable) out.push(usable);
    }
    if (out.length === 0) return null;

    setTtlMs = ttlMs;
    return out;
  }

  async function load(force) {
    if (inflight) return inflight;
    const fresh = set !== null && !force && now() < setLoadedAtMs + setTtlMs;
    if (fresh) return set;
    inflight = (async () => {
      const keys = await retrieveKeys();
      if (!keys) return null;
      set = keys;
      setLoadedAtMs = now();
      return set;
    })();
    try { return await inflight; } finally { inflight = null; }
  }

  async function verify(token) {
    let parsed;
    try { parsed = parseJwt(token); }
    catch (e) { return { ok: false, reason: e?.message ?? "malformed jwt" }; }

    const { header } = parsed;
    if (header?.alg !== "RS256") return { ok: false, reason: "unexpected algorithm" };
    if (typeof header?.kid !== "string" || header.kid === "") return { ok: false, reason: "missing key id" };

    let keys = await load(false);
    if (keys === null) return { ok: false, reason: "could not fetch signing keys" };
    let entry = keys.find(k => k.kid === header.kid);

    // Key rotation: an unknown kid warrants exactly one force refresh. A
    // failed refresh still fails closed — stale keys never vouch for a new kid.
    if (!entry) {
      keys = await load(true);
      if (keys === null) return { ok: false, reason: "could not refresh signing keys" };
      entry = keys.find(k => k.kid === header.kid);
    }
    if (!entry) return { ok: false, reason: "unknown key id" };

    let publicKey;
    try {
      publicKey = await crypto.subtle.importKey(
        "jwk", entry.jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    } catch {
      return { ok: false, reason: "unusable public key" };
    }

    const signedInput = enc.encode(`${parsed.headB64}.${parsed.payB64}`);
    let good;
    try {
      good = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, publicKey, parsed.sigBytes, signedInput);
    } catch {
      return { ok: false, reason: "verification error" };
    }
    if (!good) return { ok: false, reason: "signature verification failed" };
    return { ok: true, claims: parsed.payload, header };
  }

  return { verify };
}