// Validate the browser's interpretation, but preserve the original path:
// serializing a normalized pathname can turn /a/..//host into //host.
export function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")
      || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "";
  const origin = "https://return-path.invalid";
  try {
    return new URL(value, origin).origin === origin ? value : "";
  } catch {
    return "";
  }
}
