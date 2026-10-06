import type { SaveScope } from "../types.js";

export interface TabLike {
  id?: number;
  active?: boolean;
  windowId?: number;
  pinned?: boolean;
  url?: string;
  title?: string;
  favIconUrl?: string;
  index?: number;
  audible?: boolean;
  mutedInfo?: { muted?: boolean };
  discarded?: boolean;
}

/**
 * Pure selection of which tabs a save scope should target.
 * `activeTabId` is the tab that triggered the action (usually the active one).
 */
export function selectTabsForScope(
  tabsInWindow: TabLike[],
  scope: SaveScope,
  activeTabId: number | undefined,
): TabLike[] {
  if (scope === "current") {
    if (activeTabId == null) {
      return tabsInWindow.filter((t) => Boolean(t.active));
    }
    return tabsInWindow.filter((t) => t.id === activeTabId);
  }
  if (scope === "others") {
    return tabsInWindow.filter((t) => t.id !== activeTabId);
  }
  return [...tabsInWindow];
}

export function estimateMemoryFreedMb(
  savedCount: number,
  mbPerTab = 50,
): number {
  return Math.max(0, Math.round(savedCount * mbPerTab));
}
