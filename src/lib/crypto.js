// Pure crypto/token helpers. Uses WebCrypto (Workers + Node 22 both provide it).
const enc = new TextEncoder();

export function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// PBKDF2-SHA256. 100k = the maximum Workers supports; verifyPassword reads
// the iteration count from each stored hash so bumps stay backward-compatible.
const PBKDF2_ITERS = 100000;

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const bits = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const dk = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERS }, bits, 256
  );
  const hex = a => [...new Uint8Array(a)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${PBKDF2_ITERS}$${hex(salt)}$${hex(dk)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iters, saltHex, expected] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
    const bits = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const dk = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iters) }, bits, 256
    );
    const actual = [...new Uint8Array(dk)].map(b => b.toString(16).padStart(2, "0")).join("");
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Crockford base32 pairing code: no I/L/O/U confusables.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function pairingCode(len = 8) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map(b => CODE_ALPHABET[b % 32]).join("");
}
