// Google OAuth (OIDC) helpers. Pure logic is injectable/testable.
//
// Security model: the id_token arrives server-to-server from Google's token
// endpoint over TLS, so per Google's guidance claims validation (iss/aud/
// exp/nonce) is what we enforce here rather than JWKS signature checks.

const enc = new TextEncoder();

function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const bytes = enc.encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

// Signed, stateless state parameter: carries nonce + optional redirect path.
// Returns { state, nonce } — the nonce MUST also be sent as the `nonce`
// authorization parameter so Google echoes it back inside the id_token.
export async function mintState(secret, next = "", ttlSecs = 600) {
  const nonce = crypto.randomUUID();
  const payload = b64urlEncode({
    n: nonce,
    x: Math.floor(Date.now() / 1000) + ttlSecs,
    p: typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "",
  });
  const { hmacHex } = await import("./crypto.js");
  return { state: `${payload}.${await hmacHex(secret, `state:${payload}`)}`, nonce };
}

export async function verifyState(secret, state) {
  if (typeof state !== "string" || !state.includes(".")) return null;
  const [payload, sig] = state.split(".");
  const { hmacHex, timingSafeEqual } = await import("./crypto.js");
  const expected = await hmacHex(secret, `state:${payload}`);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const doc = JSON.parse(b64urlDecode(payload));
    if (!doc?.n || !doc?.x || doc.x < Math.floor(Date.now() / 1000)) return null;
    return { nonce: doc.n, path: doc.p ?? "" };
  } catch {
    return null;
  }
}

export function validateIdTokenClaims(claims, clientId, nonce) {
  return claimsFailureReason(claims, clientId, nonce) === null;
}

export function claimsFailureReason(claims, clientId, nonce) {
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss))
    return "bad issuer";
  if (claims.aud !== clientId) return "audience mismatch";
  if (!(Number(claims.exp) > Math.floor(Date.now() / 1000))) return "expired";
  if (typeof nonce !== "string" || claims.nonce !== nonce) return "nonce mismatch";
  if (typeof claims.email !== "string") return "missing email";
  if (claims.email_verified === false) return "email not verified";
  return null;
}

export function claimsToIdentity(claims) {
  return {
    provider: "google",
    uid: String(claims.sub),
    email: String(claims.email).toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : "",
  };
}

export async function exchangeCode({ clientId, clientSecret }, code, redirectUri, fetchImpl = fetch) {
  const resp = await fetchImpl(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  let body = {};
  try { body = await resp.json(); } catch { /* fallthrough */ }
  return { status: resp.status, body };
}
