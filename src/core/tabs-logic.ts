import { hostFromUrl, urlsEqual, isAllowedPersistUrl } from "./id.js";
import type { SavedTab } from "../types.js";

const INTERNAL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "chrome-untrusted://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
];

export function isInternalUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    INTERNAL_PREFIXES.some((p) => lower.startsWith(p)) ||
    lower === "about:blank"
  );
}

export function isSavableUrl(url: string): boolean {
  if (!url || isInternalUrl(url)) return false;
  return isAllowedPersistUrl(url);
}

export function findDuplicate(
  entries: SavedTab[],
  url: string,
): SavedTab | undefined {
  return entries.find((e) => urlsEqual(e.url, url));
}

export function isWhitelisted(url: string, whitelist: string[]): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  return whitelist.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (!r) return false;
    return host === r || host.endsWith(`.${r}`);
  });
}

export function searchEntries(entries: SavedTab[], query: string): SavedTab[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function sortEntriesNewestFirst(entries: SavedTab[]): SavedTab[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt);
}

export function groupNames(entries: SavedTab[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.group.trim()) set.add(e.group.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export { urlsEqual, isAllowedPersistUrl };
