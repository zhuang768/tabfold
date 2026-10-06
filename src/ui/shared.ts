import type { Request, Response } from "../types.js";

export async function send<T = unknown>(req: Request): Promise<Response<T>> {
  return (await chrome.runtime.sendMessage(req)) as Response<T>;
}

/** Escape text for safe textContent assignment helpers — prefer textContent over innerHTML. */
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

export function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
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
  const ch = (title.trim()[0] || "?").toUpperCase();
  return ch;
}
