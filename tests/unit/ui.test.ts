import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as esbuild from "esbuild";

class El {
  tagName: string;
  id: string;
  children: El[];
  hidden: boolean;
  value: string;
  checked: boolean;
  className: string;
  textContent: string;
  listeners: Record<string, Array<(e?: unknown) => void | Promise<void>>>;
  classList: { add: (c: string) => void; remove: (c: string) => void };
  style: Record<string, string>;

  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.hidden = false;
    this.value = "";
    this.checked = false;
    this.className = "";
    this.textContent = "";
    this.listeners = {};
    this.classList = {
      add: (c: string) => {
        if (!this.className.includes(c))
          this.className = (this.className + " " + c).trim();
      },
      remove: (c: string) => {
        this.className = this.className
          .replace(new RegExp(`\\b${c}\\b`, "g"), "")
          .trim();
      },
    };
    this.style = {};
  }
  addEventListener(k: string, f: (e?: unknown) => void | Promise<void>) {
    (this.listeners[k] ??= []).push(f);
  }
  append(...xs: El[]) {
    this.children.push(...xs);
  }
  replaceChildren(...xs: El[]) {
    this.children = [...xs];
  }
  get options(): El[] {
    return this.children;
  }
  querySelectorAll(sel: string): El[] {
    return this.children.flatMap((x) =>
      typeof x === "object" && x !== null
        ? [
            ...(x.tagName === sel.toUpperCase() ? [x] : []),
            ...x.querySelectorAll(sel),
          ]
        : [],
    );
  }
  setAttribute(k: string, v: unknown) {
    (this as unknown as Record<string, unknown>)[k] = v;
  }
  removeAttribute(k: string) {
    delete (this as unknown as Record<string, unknown>)[k];
  }
  focus() {}
  click() {}
  remove() {}
  replaceWith() {}
  async emit(k: string, e: unknown = { target: this }) {
    for (const f of this.listeners[k] ?? []) await f(e);
  }
}

const mkDb = (undo: unknown = null) => ({
  schemaVersion: 2,
  entries: [
    {
      schemaVersion: 2,
      id: "e1",
      url: "https://example.test/one",
      title: "One",
      favicon: null,
      savedAt: 1700000000000,
      source: { windowId: 1, index: 0, pinned: false },
      group: "",
      tags: [],
      status: "saved",
    },
  ],
  settings: {
    theme: "light",
    defaultScope: "current",
    removeAfterRestore: true,
    whitelist: [],
    onboardingComplete: true,
    unsavedHintAcknowledged: false,
    restoreBatchSize: 5,
  },
  stats: { totalClosed: 2, totalRestored: 1, totalImported: 1 },
  undo,
});

async function setup(
  file: string,
  extras: string,
  handler: (req: { type: string; [k: string]: unknown }) => Promise<unknown>,
  session: Record<string, unknown> = {},
) {
  const els = new Map<string, El>();
  const get = (id: string) => {
    if (!els.has(id))
      els.set(
        id,
        new El(
          id.includes("scope") || id === "target-tab" ? "select" : "div",
          id,
        ),
      );
    return els.get(id)!;
  };
  const requests: Array<{ type: string; [k: string]: unknown }> = [];
  const now = 1700000000000;
  const doc = {
    getElementById: get,
    createElement: (t: string) => new El(t),
    createTextNode: (t: string) => t,
    documentElement: new El("html"),
    addEventListener: () => {},
    activeElement: null,
  };
  const win = {
    setTimeout: (f: () => void, _delay: number) => {
      f();
      return 1;
    },
    clearTimeout: () => {},
    confirm: () => true,
  };
  const chrome = {
    runtime: {
      sendMessage: async (req: { type: string; [k: string]: unknown }) => {
        requests.push(req);
        return await handler(req);
      },
      getURL: (p: string) => "chrome-extension://fixture/" + p,
      openOptionsPage: async () => {},
    },
    storage: {
      session: {
        get: async () => session,
        set: async (x: Record<string, unknown>) => Object.assign(session, x),
        remove: async () => {},
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: async () => [],
    },
  };

  const src =
    fs.readFileSync(file, "utf8").replace(/void init\(\);\s*$/, "") +
    "\nglobalThis.audit={" +
    extras +
    "};";

  const built = await esbuild.build({
    stdin: {
      contents: src,
      resolveDir: path.dirname(path.resolve(file)),
      sourcefile: path.basename(file),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    logLevel: "silent",
  });

  class FakeDate extends Date {
    constructor(...args: [number | string | Date | undefined] | unknown[]) {
      if (args.length === 0) super(now);
      else if (args.length === 1) super(args[0] as number | string | Date);
      else {
        const [a, b, c, d, e, f, g] = args as number[];
        super(a ?? 0, b ?? 0, c ?? 1, d ?? 0, e ?? 0, f ?? 0, g ?? 0);
      }
    }
    static override now() {
      return now;
    }
  }

  interface AuditApi {
    load: () => Promise<void>;
    init: () => Promise<void>;
    showStatus: (msg: string, kind: string) => Promise<void>;
    getDatabase: () => unknown;
  }

  const context = vm.createContext({
    document: doc,
    window: win,
    chrome,
    console,
    Date: FakeDate,
    Intl,
    URL,
    Blob,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    globalThis: {},
  });
  context.globalThis = context;
  vm.runInContext(built.outputFiles[0]!.text, context);
  return {
    a: (context as unknown as Record<string, unknown>).audit as AuditApi,
    get,
    requests,
  };
}

describe("UI State, Timing & Isolation Regressions (R409–R414)", () => {
  for (const surface of ["popup", "list"]) {
    it(`${surface}: non-Undo status retains persisted Undo button access (R409)`, async () => {
      const ui = await setup(
        "src/ui/" + surface + ".ts",
        "load,showStatus,getDatabase:()=>database",
        async (req) =>
          req.type === "get-state"
            ? {
                ok: true,
                data: {
                  database: mkDb({ ids: ["e1"], expiresAt: 1700000012000 }),
                  backups: [],
                },
              }
            : req.type === "list-window-tabs"
              ? { ok: true, data: { tabs: [] } }
              : { ok: true, data: {} },
      );

      ui.get("status").hidden = true;
      await ui.a.load();
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);

      await ui.a.showStatus("Injected import failure", "danger");
      await ui.a.load();

      expect(ui.get("status").children[0]?.textContent).toBe(
        "Injected import failure",
      );
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);
    });
  }

  it("list: stale out-of-order target response cannot repopulate error-state picker (R410)", async () => {
    let phase = "initial";
    let resolveOld: ((val: unknown) => void) | undefined;
    let resolveStarted: (() => void) | undefined;
    const started = new Promise<void>((r) => {
      resolveStarted = r;
    });
    const oldTargets = new Promise<unknown>((r) => {
      resolveOld = r;
    });

    const lib = await setup(
      "src/ui/list.ts",
      "init,load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state")
          return phase === "fail"
            ? { ok: false, error: "Injected newer get-state failure" }
            : { ok: true, data: { database: mkDb(), backups: [] } };
        if (req.type === "list-window-tabs") {
          if (phase === "slow") {
            resolveStarted?.();
            return await oldTargets;
          }
          return {
            ok: true,
            data: {
              tabs: [
                {
                  id: 17,
                  title: "Initial",
                  url: "https://example.test/initial",
                },
              ],
            },
          };
        }
        if (req.type === "save")
          return { ok: false, error: "Do not mutate the mock" };
        return { ok: true, data: {} };
      },
    );

    await lib.a.init();
    phase = "slow";
    const olderLoad = lib.a.load();
    await started;

    phase = "fail";
    await lib.a.load();

    expect(lib.a.getDatabase()).toBeNull();
    expect(lib.get("target-tab").options.length).toBe(0);

    resolveOld?.({
      ok: true,
      data: {
        tabs: [
          { id: 31, title: "Stale target", url: "https://example.test/stale" },
        ],
      },
    });
    await olderLoad;

    const restoredOptions = lib
      .get("target-tab")
      .options.map((o) => ({ value: o.value, text: o.textContent }));
    expect(restoredOptions.length).toBe(0);

    const firstOption = lib.get("target-tab").options[0];
    if (firstOption) {
      lib.get("target-tab").value = firstOption.value;
    }
    await lib.get("btn-save").emit("click");

    const saveRequests = lib.requests.filter((r) => r.type === "save");
    expect(saveRequests.length).toBe(0);
  });

  it("options: save is guarded before initial settings load completes (R410)", async () => {
    const opts = await setup("src/ui/options.ts", "init", async (req) => {
      if (req.type === "get-state") {
        return new Promise(() => {}); // never resolves
      }
      return { ok: true, data: {} };
    });

    await opts.get("btn-save").emit("click");
    const patchRequests = opts.requests.filter(
      (r) => r.type === "patch-settings",
    );
    expect(patchRequests.length).toBe(0);
  });
});
