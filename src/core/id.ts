/** Identifiers and conservative URL equality (preserve content-bearing fragments). */

export function createId(prefix = "t"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

/** Deterministic id for legacy rows that lacked an id (stable across reads). */
export function stableMigratedId(
  url: string,
  savedAt: number,
  title: string,
): string {
  const input = `${url}\0${savedAt}\0${title}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `mig_${(h >>> 0).toString(36)}`;
}

/**
 * Conservative equality: keep hash/fragments (SPA routes differ)
 * and distinct paths (do not conflate /page with /page/).
 */
export function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url.trim());
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function urlsEqual(a: string, b: string): boolean {
  return normalizeUrlForDedupe(a) === normalizeUrlForDedupe(b);
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** http(s) and file only — never javascript:/data:/chrome: etc. */
export function isAllowedPersistUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "http:" ||
      u.protocol === "https:" ||
      u.protocol === "file:"
    );
  } catch {
    return false;
  }
}
