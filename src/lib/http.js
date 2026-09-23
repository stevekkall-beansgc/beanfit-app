// Cookie/body plumbing shared by page and API handlers.

const HTML_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'unsafe-inline'",
].join("; ");

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `bf_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return "bf_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export async function readForm(request) {
  const fd = await request.formData();
  const out = {};
  for (const [k, v] of fd.entries()) out[k] = String(v);
  return out;
}

export function html(body, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  responseHeaders.set("cache-control", "no-store, must-revalidate");
  responseHeaders.set("content-security-policy", HTML_CSP);
  return new Response(body, { status, headers: responseHeaders });
}

export function javascript(body, status = 200, headers = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/javascript; charset=utf-8");
  responseHeaders.set("cache-control", "no-store, must-revalidate");
  responseHeaders.set("x-content-type-options", "nosniff");
  return new Response(body, { status, headers: responseHeaders });
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}
