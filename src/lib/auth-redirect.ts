/** Only allow same-origin app paths in user-controlled authentication redirects. */
export function safeAuthRedirect(value: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;
  if (hasUnsafeCharacter(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || hasUnsafeCharacter(decoded)) return fallback;
    const base = "https://auth.local";
    const parsed = new URL(value, base);
    return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function hasUnsafeCharacter(value: string): boolean {
  return [...value].some(
    (char) => char === "\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
