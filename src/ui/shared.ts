import type { Request, Response } from "../types.js";
import { STRINGS } from "../strings.js";

export async function send<T = unknown>(req: Request): Promise<Response<T>> {
  try {
    return (await chrome.runtime.sendMessage(req)) as Response<T>;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : STRINGS.messagingFailed,
    };
  }
}

export function text(el: Element | null, value: string): void {
  if (el) el.textContent = value;
}

export function applyTheme(theme: "system" | "light" | "dark"): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/** Always English product dates (not system locale). */
export function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

export function downloadText(
  filename: string,
  content: string,
  mime = "application/json",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function letterAvatar(title: string): string {
  return (title.trim()[0] || "?").toUpperCase();
}

/** Local Chrome favicon cache — never set img.src to arbitrary http(s). */
export function localFaviconUrl(pageUrl: string, size = 32): string {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl);
  u.searchParams.set("size", String(size));
  return u.toString();
}

export function renderFavicon(
  container: HTMLElement,
  pageUrl: string | null,
  title: string,
): void {
  container.replaceChildren();
  if (pageUrl && /^https?:/i.test(pageUrl)) {
    const img = document.createElement("img");
    img.className = "favicon";
    img.alt = STRINGS.faviconAlt;
    img.width = 28;
    img.height = 28;
    img.referrerPolicy = "no-referrer";
    img.src = localFaviconUrl(pageUrl);
    img.addEventListener("error", () => {
      const fb = document.createElement("div");
      fb.className = "favicon-fallback";
      fb.textContent = letterAvatar(title);
      img.replaceWith(fb);
    });
    container.append(img);
  } else {
    const fb = document.createElement("div");
    fb.className = "favicon-fallback";
    fb.textContent = letterAvatar(title);
    container.append(fb);
  }
}

export function listenStorageReload(reload: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes.tabfold_database || changes.tabfold_backups)
    ) {
      reload();
    }
  });
}
