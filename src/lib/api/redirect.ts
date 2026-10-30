// Only paths on our own origin, so the callback cannot be used as an open
// redirect. Resolving against the origin and comparing catches tricks like
// `//evil.com`, `/\\evil.com` and `/\t/evil.com`.
export function safeNext(value: string | null, origin: string): URL {
  const fallback = new URL("/", origin);
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    // Dot segments can normalize to a path like "//evil.com" (from
    // "/.//evil.com"), which callers that use the path as a relative URL
    // would treat as protocol relative.
    if (url.pathname.startsWith("//") || url.pathname.includes("\\"))
      return fallback;
    return url;
  } catch {
    return fallback;
  }
}
