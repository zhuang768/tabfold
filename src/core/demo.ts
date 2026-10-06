import { createId } from "./id.js";
import { SCHEMA_VERSION, type SavedTab } from "../types.js";

/** Deterministic demo entries for "Load demo data" — real local data, not mocked API results. */
export function createDemoEntries(now = Date.now()): SavedTab[] {
  const samples: Array<{
    url: string;
    title: string;
    group: string;
    tags: string[];
  }> = [
    {
      url: "https://developer.chrome.com/docs/extensions/",
      title: "Chrome Extensions — Documentation",
      group: "Work",
      tags: ["docs"],
    },
    {
      url: "https://www.wikipedia.org/",
      title: "Wikipedia",
      group: "Read later",
      tags: [],
    },
    {
      url: "https://example.com/",
      title: "Example Domain",
      group: "",
      tags: ["demo"],
    },
    {
      url: "https://mdn.dev/",
      title: "MDN Web Docs",
      group: "Work",
      tags: ["docs"],
    },
    {
      url: "https://www.ietf.org/rfc/rfc2616.txt",
      title: "RFC 2616",
      group: "Read later",
      tags: ["reference"],
    },
  ];

  return samples.map((s, i) => ({
    schemaVersion: SCHEMA_VERSION,
    id: createId("demo"),
    url: s.url,
    title: s.title,
    favicon: null,
    savedAt: now - i * 60_000,
    source: { windowId: -1, index: i, pinned: false },
    group: s.group,
    tags: s.tags,
    status: "saved" as const,
  }));
}
