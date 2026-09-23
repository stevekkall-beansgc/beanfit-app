// Deterministic Google-signature test fixtures: RSA key generation, real
// RS256 id_token signing (Web Crypto — same primitive the verifier uses),
// payload tampering, and an injected fetch that serves a fake discovery +
// JWKS document without any network access.

import { GOOGLE_DISCOVERY_URL, GOOGLE_JWKS_URL } from "../../src/lib/jwks.js";

const enc = new TextEncoder();

export function b64urlBytes(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlJson(obj) {
  return b64urlBytes(enc.encode(JSON.stringify(obj)));
}

export function jwkDoc(jwk) {
  // Slim the exported JWK down to what a real Google cert carries.
  return { kty: "RSA", use: "sig", alg: "RS256", kid: jwk.kid, n: jwk.n, e: jwk.e };
}

export async function makeSigningKey(kid, bits = 2048) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, jwk };
}

export async function signIdToken(privateKey, payload, { kid = "test-key-1", alg = "RS256", header = {} } = {}) {
  const head = { alg, kid, typ: "JWT", ...header };
  const headB64 = b64urlJson(head);
  const payB64 = b64urlJson(payload);
  const signed = enc.encode(`${headB64}.${payB64}`);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, privateKey, signed);
  return `${headB64}.${payB64}.${b64urlBytes(sig)}`;
}

// Rewrites the payload of an already-signed token while KEEPING the original
// signature bytes, so verification must fail on signature before claims.
export async function tamperPayload(token, mutate) {
  const [headB64, payB64, sigB64] = token.split(".");
  const claims = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(payB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
  return `${headB64}.${b64urlJson(mutate(claims))}.${sigB64}`;
}

export function jsonResponse(obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "content-type": "application/json", ...extra },
  });
}

// Injected fetch that answers the real pinned Google discovery + JWKS URLs
// with fixtures. Records every URL it was asked to fetch.
export function googleGoogleFetch(jwks, {
  discoveryJwksUri = GOOGLE_JWKS_URL,
  jwksHeaders = {},
  serveDiscovery = true,
  jwksOnCall = null,
} = {}) {
  const calls = [];
  let jwksCalls = 0;
  const impl = async (url) => {
    calls.push(String(url));
    if (serveDiscovery && String(url) === GOOGLE_DISCOVERY_URL) {
      return jsonResponse({ jwks_uri: discoveryJwksUri });
    }
    if (String(url) === GOOGLE_JWKS_URL) {
      jwksCalls += 1;
      const keys = jwksOnCall ? jwksOnCall(jwksCalls) : (Array.isArray(jwks) ? jwks : jwks[jwksCalls - 1]);
      return jsonResponse({ keys: keys ?? [] }, jwksHeaders);
    }
    return new Response("not found", { status: 404 });
  };
  impl.calls = calls;
  impl.jwksHit = () => jwksCalls;
  return impl;
}