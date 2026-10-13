import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as esbuild from "esbuild";
import { STRINGS } from "../../src/strings.js";

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
  parent: El | null;

  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parent = null;
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
  append(...xs: Array<El | string>) {
    for (const x of xs) {
      if (typeof x === "object" && x !== null) (x as El).parent = this;
      this.children.push(x as El);
    }
  }
  replaceChildren(...xs: Array<El | string>) {
    for (const c of this.children) {
      if (typeof c === "object" && c !== null) (c as El).parent = null;
    }
    this.children = [];
    this.append(...xs);
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
  getAttribute(k: string) {
    const val = (this as unknown as Record<string, unknown>)[k];
    return val !== undefined ? String(val) : null;
  }
  setAttribute(k: string, v: unknown) {
    (this as unknown as Record<string, unknown>)[k] = v;
  }
  removeAttribute(k: string) {
    delete (this as unknown as Record<string, unknown>)[k];
  }
  focus() {}
  click() {}
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (c: El | string) => c !== this,
      );
      this.parent = null;
    }
  }
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
  session:
    Record<string, unknown> | (() => Promise<Record<string, unknown>>) = {},
  local: Record<string, unknown> = {},
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
  let now = 1700000000000;
  let timerId = 0;
  const timers = new Map<
    number,
    { f: () => void; delay: number; at: number }
  >();
  const doc = {
    getElementById: get,
    createElement: (t: string) => new El(t),
    createTextNode: (t: string) => t,
    documentElement: new El("html"),
    addEventListener: () => {},
    activeElement: null,
  };
  const win = {
    setTimeout: (f: () => void, delay = 0) => {
      const id = ++timerId;
      timers.set(id, { f, delay, at: now + delay });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
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
        get: async () =>
          typeof session === "function"
            ? await (session as () => Promise<Record<string, unknown>>)()
            : session,
        set: async (x: Record<string, unknown>) => {
          if (typeof session === "object" && session !== null) {
            Object.assign(session, x);
          }
        },
        remove: async () => {},
      },
      local: {
        get: async () => local,
        set: async (x: Record<string, unknown>) => Object.assign(local, x),
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
    showStatus: (msg: string, kind?: string, ids?: string[]) => Promise<void>;
    getDatabase: () => unknown;
    doUndo?: () => Promise<void>;
    getLoaded?: () => boolean;
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
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.f();
      }
    }
  };
  return {
    a: (context as unknown as Record<string, unknown>).audit as AuditApi,
    get,
    requests,
    timers,
    advance,
    now: () => now,
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
    let resolveState!: (val: unknown) => void;
    const pendingState = new Promise((r) => {
      resolveState = r;
    });
    const opts = await setup("src/ui/options.ts", "init", async (req) => {
      if (req.type === "get-state") {
        return pendingState;
      }
      return { ok: true, data: {} };
    });

    void opts.a.init();
    await new Promise((r) => setTimeout(r, 10));
    await opts.get("btn-save").emit("click");
    const patchRequests = opts.requests.filter(
      (r) => r.type === "patch-settings",
    );
    expect(patchRequests.length).toBe(0);

    resolveState({
      ok: true,
      data: {
        database: mkDb(),
        backups: [],
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    await opts.get("btn-save").emit("click");
    const patchRequestsAfter = opts.requests.filter(
      (r) => r.type === "patch-settings",
    );
    expect(patchRequestsAfter.length).toBe(1);
  });

  for (const surface of ["popup", "list"]) {
    it(`${surface}: fresh-save Undo disappears at authoritative TTL (R512)`, async () => {
      let db = mkDb();
      const ui = await setup(
        "src/ui/" + surface + ".ts",
        "load,showStatus,doUndo,getDatabase:()=>database",
        async (req) =>
          req.type === "get-state"
            ? { ok: true, data: { database: db, backups: [] } }
            : req.type === "list-window-tabs"
              ? { ok: true, data: { tabs: [] } }
              : { ok: true, data: {} },
      );
      await ui.a.load();
      db = mkDb({ ids: ["e1"], expiresAt: 1700000000100 });
      await ui.a.showStatus("Saved 1 tab.", "ok", ["e1"]);
      await ui.a.load();
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);
      ui.advance(101);
      expect(ui.get("status").querySelectorAll("button").length).toBe(0);
    });

    it(`${surface}: completed Undo clears obsolete control immediately (R512)`, async () => {
      let db = mkDb({ ids: ["e1"], expiresAt: 1700000012000 });
      const ui = await setup(
        "src/ui/" + surface + ".ts",
        "load,showStatus,doUndo,getDatabase:()=>database",
        async (req) => {
          if (req.type === "get-state")
            return { ok: true, data: { database: db, backups: [] } };
          if (req.type === "list-window-tabs")
            return { ok: true, data: { tabs: [] } };
          if (req.type === "undo") {
            db = { ...db, undo: null };
            return {
              ok: true,
              data: { message: "Restored the tab you just saved." },
            };
          }
          return { ok: true, data: {} };
        },
      );
      await ui.a.load();
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);
      if (ui.a.doUndo) await ui.a.doUndo();
      expect(ui.get("status").querySelectorAll("button").length).toBe(0);
    });
  }

  it("popup: out-of-order load drops stale success after newer failure (R513)", async () => {
    let mode = "initial";
    let resolveOld!: (val: unknown) => void;
    let startedResolve!: () => void;
    const started = new Promise((r) => {
      startedResolve = r as () => void;
    });
    const oldPromise = new Promise((r) => {
      resolveOld = r;
    });

    const ui = await setup(
      "src/ui/popup.ts",
      "load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          if (mode === "old") {
            startedResolve();
            return await oldPromise;
          }
          if (mode === "fail") {
            return { ok: false, error: "Injected newer load failure" };
          }
          return { ok: true, data: { database: mkDb() } };
        }
        return { ok: true, data: {} };
      },
    );

    await ui.a.load();
    mode = "old";
    const pending = ui.a.load();
    await started;
    mode = "fail";
    await ui.a.load();
    expect(ui.a.getDatabase()).toBeNull();

    resolveOld({ ok: true, data: { database: mkDb() } });
    await pending;
    expect(ui.a.getDatabase()).toBeNull();
  });

  it("popup: durable undo authority exposes Undo button when database.undo is null (R604)", async () => {
    const durable = {
      ids: ["e1"],
      expiresAt: 1700000012000,
    };
    const ui = await setup(
      "src/ui/popup.ts",
      "load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          return { ok: true, data: { database: mkDb(null) } };
        }
        return { ok: true, data: {} };
      },
      { tabfold_durable_undo: durable },
      { tabfold_durable_undo: durable },
    );
    await ui.a.load();
    expect(
      (ui.a as { getDatabase: () => { undo: unknown } }).getDatabase().undo,
    ).toBeNull();
    expect(ui.get("status").querySelectorAll("button").length).toBe(1);
  });

  it("list: durable undo authority exposes Undo button when database.undo is null (R604)", async () => {
    const durable = {
      ids: ["e1"],
      expiresAt: 1700000012000,
    };
    const ui = await setup(
      "src/ui/list.ts",
      "load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          return { ok: true, data: { database: mkDb(null) } };
        }
        if (req.type === "list-window-tabs") {
          return { ok: true, data: { tabs: [] } };
        }
        return { ok: true, data: {} };
      },
      { tabfold_durable_undo: durable },
      { tabfold_durable_undo: durable },
    );
    await ui.a.load();
    expect(
      (ui.a as { getDatabase: () => { undo: unknown } }).getDatabase().undo,
    ).toBeNull();
    expect(ui.get("status").querySelectorAll("button").length).toBe(1);
  });

  it("options: load shows visible loading feedback before get-state completes (R607)", async () => {
    let resolveState!: (v: unknown) => void;
    const statePromise = new Promise((r) => {
      resolveState = r;
    });
    const ui = await setup("src/ui/options.ts", "load", async (req) => {
      if (req.type === "get-state") {
        await statePromise;
        return { ok: true, data: { database: mkDb(), backups: [] } };
      }
      return { ok: true, data: {} };
    });
    const pendingLoad = ui.a.load();
    expect(ui.get("status").textContent).toContain("Loading");
    expect(ui.get("status").hidden).toBe(false);
    resolveState(null);
    await pendingLoad;
    expect(ui.get("status").hidden).toBe(true);
  });

  it("popup: out-of-order resolveEffectiveUndo does not overwrite newer state (R706)", async () => {
    let mode = "initial";
    let resolveSlowSession!: (val: unknown) => void;
    let startedResolve!: () => void;
    const started = new Promise<void>((r) => {
      startedResolve = r;
    });
    const slowSessionPromise = new Promise((r) => {
      resolveSlowSession = r;
    });

    const ui = await setup(
      "src/ui/popup.ts",
      "load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          if (mode === "slow") {
            return { ok: true, data: { database: mkDb() } };
          }
          if (mode === "fail") {
            return { ok: false, error: "Newer failure" };
          }
          return { ok: true, data: { database: mkDb() } };
        }
        return { ok: true, data: {} };
      },
      async () => {
        if (mode === "slow") {
          startedResolve();
          return (await slowSessionPromise) as Record<string, unknown>;
        }
        return {};
      },
    );

    await ui.a.load();
    mode = "slow";
    const pendingSlow = ui.a.load();
    await started;

    mode = "fail";
    await ui.a.load();
    expect(ui.a.getDatabase()).toBeNull();

    resolveSlowSession({
      tabfold_durable_undo: { ids: ["e1"], expiresAt: 1700000012000 },
    });
    await pendingSlow;
    expect(ui.a.getDatabase()).toBeNull();
  });

  for (const surface of ["popup", "list"]) {
    it(`${surface}: unrelated status message does not destroy durable undo button (R707)`, async () => {
      const durable = {
        ids: ["e1"],
        expiresAt: 1700000012000,
      };
      const ui = await setup(
        "src/ui/" + surface + ".ts",
        "load,showStatus,getDatabase:()=>database",
        async (req) => {
          if (req.type === "get-state") {
            return { ok: true, data: { database: mkDb(null), backups: [] } };
          }
          if (req.type === "list-window-tabs") {
            return { ok: true, data: { tabs: [] } };
          }
          return { ok: true, data: {} };
        },
        { tabfold_durable_undo: durable },
        { tabfold_durable_undo: durable },
      );
      await ui.a.load();
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);

      await ui.a.showStatus("Unrelated background message", "warn");
      expect(ui.get("status").children[0]?.textContent).toContain(
        "Unrelated background message",
      );
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);
    });
  }

  it("options: load removes aria-busy even when custom status warning is shown (R708)", async () => {
    let warnEmitted = false;
    let uiRef: {
      a: { showStatus: (msg: string, kind?: string) => Promise<void> };
    } | null = null;
    const ui = await setup(
      "src/ui/options.ts",
      "load,showStatus",
      async (req) => {
        if (req.type === "get-state") {
          if (!warnEmitted && uiRef) {
            warnEmitted = true;
            await uiRef.a.showStatus("Warning during load", "warn");
          }
          return { ok: true, data: { database: mkDb(), backups: [] } };
        }
        return { ok: true, data: {} };
      },
    );
    uiRef = ui;
    await ui.a.load();
    expect(ui.get("status").getAttribute("aria-busy")).toBeNull();
  });

  for (const surface of ["popup", "list"]) {
    it(`${surface}: failed Undo preserves retry entry and visible error within TTL (R805)`, async () => {
      const durable = {
        ids: ["e1"],
        expiresAt: 1700000012000,
      };
      let undoShouldFail = true;
      const ui = await setup(
        "src/ui/" + surface + ".ts",
        "load,doUndo,showStatus,getDatabase:()=>database",
        async (req) => {
          if (req.type === "get-state") {
            return {
              ok: true,
              data: {
                database: mkDb(null),
                backups: [],
              },
            };
          }
          if (req.type === "list-window-tabs") {
            return { ok: true, data: { tabs: [] } };
          }
          if (req.type === "undo") {
            if (undoShouldFail) {
              return { ok: false, error: "Injected Undo transport failure" };
            }
            return { ok: true, data: { message: "Restored 1 tab." } };
          }
          return { ok: true, data: {} };
        },
        { tabfold_durable_undo: durable },
        { tabfold_durable_undo: durable },
      );
      await ui.a.load();
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);

      await ui.a.doUndo?.();

      expect(ui.get("status").children[0]?.textContent).toContain(
        "Injected Undo transport failure",
      );
      expect(ui.get("status").querySelectorAll("button").length).toBe(1);

      undoShouldFail = false;
      await ui.a.doUndo?.();

      expect(ui.get("status").children[0]?.textContent).toContain(
        "Restored 1 tab.",
      );
    });
  }

  it("popup: distinguishes total 0 empty state from filtered 0 search state (R907)", async () => {
    let db = {
      ...mkDb(),
      entries: [] as ReturnType<typeof mkDb>["entries"],
    };
    const ui = await setup(
      "src/ui/popup.ts",
      "init,load,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          return { ok: true, data: { database: db, backups: [] } };
        }
        if (req.type === "list-window-tabs") {
          return { ok: true, data: { tabs: [] } };
        }
        return { ok: true, data: {} };
      },
    );

    // 1. Total 0: shows emptyTitle and emptyBody
    await ui.a.init();
    const listEl = ui.get("list");
    expect(listEl.children.length).toBe(1);
    const emptyDiv = listEl.children[0] as El;
    expect(emptyDiv.className).toBe("empty");
    expect(emptyDiv.children[0]?.textContent).toBe(STRINGS.emptyTitle);
    expect(emptyDiv.children[1]?.textContent).toBe(STRINGS.emptyBody);

    // 2. Database with 3 entries
    db = {
      ...mkDb(),
      entries: [
        {
          schemaVersion: 2,
          id: "e1",
          url: "https://example.test/alpha",
          title: "Alpha Tab",
          favicon: null,
          savedAt: 1700000000000,
          source: { windowId: 1, index: 0, pinned: false },
          group: "work",
          tags: [],
          status: "saved",
        },
        {
          schemaVersion: 2,
          id: "e2",
          url: "https://example.test/beta",
          title: "Beta Tab",
          favicon: null,
          savedAt: 1700000001000,
          source: { windowId: 1, index: 1, pinned: false },
          group: "",
          tags: [],
          status: "saved",
        },
        {
          schemaVersion: 2,
          id: "e3",
          url: "https://example.test/gamma",
          title: "Gamma Tab",
          favicon: null,
          savedAt: 1700000002000,
          source: { windowId: 1, index: 2, pinned: false },
          group: "",
          tags: [],
          status: "saved",
        },
      ],
      stats: { totalClosed: 3, totalRestored: 0, totalImported: 0 },
    };
    await ui.a.load();
    expect(ui.get("list").children.length).toBe(3);
    expect(ui.get("count").textContent).toContain("3/3");

    // 3. Search query yielding 0 matches ("shortcut")
    ui.get("search").value = "shortcut";
    await ui.get("search").emit("input", { target: ui.get("search") });
    expect(ui.get("list").children.length).toBe(1);
    const filteredEmptyDiv = ui.get("list").children[0] as El;
    expect(filteredEmptyDiv.className).toBe("empty");
    expect(filteredEmptyDiv.children[0]?.textContent).toBe(
      STRINGS.noMatchingTabs,
    );
    expect(filteredEmptyDiv.children.length).toBe(1); // no emptyBody
    expect(ui.get("count").textContent).toContain("0/3");

    // 4. Clear search query
    ui.get("search").value = "";
    await ui.get("search").emit("input", { target: ui.get("search") });
    expect(ui.get("list").children.length).toBe(3);
    expect(ui.get("count").textContent).toContain("3/3");
  });

  it("list: distinguishes total 0 empty state from filtered 0 search and group filter states (R907)", async () => {
    let db = {
      ...mkDb(),
      entries: [] as ReturnType<typeof mkDb>["entries"],
    };
    const ui = await setup(
      "src/ui/list.ts",
      "init,load,paint,getDatabase:()=>database",
      async (req) => {
        if (req.type === "get-state") {
          return { ok: true, data: { database: db, backups: [] } };
        }
        if (req.type === "list-window-tabs") {
          return { ok: true, data: { tabs: [] } };
        }
        return { ok: true, data: {} };
      },
    );

    // 1. Total 0: shows emptyTitle
    await ui.a.init();
    const listEl = ui.get("list");
    expect(listEl.children.length).toBe(1);
    const emptyDiv = listEl.children[0] as El;
    expect(emptyDiv.className).toBe("empty");
    expect(emptyDiv.textContent).toBe(STRINGS.emptyTitle);

    // 2. Database with entries
    db = {
      ...mkDb(),
      entries: [
        {
          schemaVersion: 2,
          id: "e1",
          url: "https://example.test/alpha",
          title: "Alpha Tab",
          favicon: null,
          savedAt: 1700000000000,
          source: { windowId: 1, index: 0, pinned: false },
          group: "research",
          tags: [],
          status: "saved",
        },
      ],
    };
    await ui.a.load();
    expect(ui.get("list").children.length).toBe(1);

    // 3. Search query yielding 0 matches
    ui.get("search").value = "nonexistent-query";
    await ui.get("search").emit("input", { target: ui.get("search") });
    expect(ui.get("list").children.length).toBe(1);
    const searchEmptyDiv = ui.get("list").children[0] as El;
    expect(searchEmptyDiv.textContent).toBe(STRINGS.noMatchingTabs);

    // 4. Clear search query
    ui.get("search").value = "";
    await ui.get("search").emit("input", { target: ui.get("search") });
    expect(ui.get("list").children.length).toBe(1);

    // 5. Group filter yielding 0 matches
    ui.get("group-filter").value = "nonexistent-group";
    await ui.get("group-filter").emit("change", {
      target: ui.get("group-filter"),
    });
    expect(ui.get("list").children.length).toBe(1);
    const groupEmptyDiv = ui.get("list").children[0] as El;
    expect(groupEmptyDiv.textContent).toBe(STRINGS.noMatchingTabs);

    // 6. Reset group filter
    ui.get("group-filter").value = "";
    await ui.get("group-filter").emit("change", {
      target: ui.get("group-filter"),
    });
    expect(ui.get("list").children.length).toBe(1);
  });
});
