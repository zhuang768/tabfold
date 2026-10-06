/** Create a reasonably unique id without crypto dependency quirks in tests. */
export function createId(prefix = "t"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Strip trailing slash for http(s) paths that are root-only equivalence
    if (
      (u.protocol === "http:" || u.protocol === "https:") &&
      u.pathname !== "/" &&
      u.pathname.endsWith("/")
    ) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function urlsEqual(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
