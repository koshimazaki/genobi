// Box 1.8: no reload dialog for saved work. The guard asks only when a copy
// is not synced (or none is registered, as on the hosted studio), and the
// reloads the app itself causes (a stale chunk, a restarted server, Vite's
// development full reload) save the copy first.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A `beforeunload` as the browser sends it: `returnValue` unset. */
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  Object.defineProperty(event, "returnValue", {
    value: undefined,
    writable: true,
  });
  window.dispatchEvent(event);
  return event as BeforeUnloadEvent;
}
const asked = () => unload().returnValue === "";

/** The Director with undo history: its guard registered. */
async function guarded() {
  const guard = await import("../src/director/leave-guard");
  window.addEventListener("beforeunload", guard.guardUnload);
  return guard;
}

/** A copy whose state the test sets; `flush` saves it. */
function fakeCopy(synced: boolean, saves = true) {
  const copy = {
    synced,
    flushed: 0,
    flush: async () => {
      copy.flushed++;
      if (saves) copy.synced = true;
      return copy.synced;
    },
    isSynced: () => copy.synced,
  };
  return copy;
}

describe("the guard asks only for unsaved work", () => {
  it("is silent while every copy is synced, and asks once one is not", async () => {
    const guard = await guarded();
    const a = fakeCopy(true);
    const b = fakeCopy(true);
    guard.flushBeforeLeaving(a.flush, a.isSynced);
    const remove = guard.flushBeforeLeaving(b.flush, b.isSynced);
    expect(asked()).toBe(false);
    // An edit waiting on its push, a failed save or a conflict reload.
    b.synced = false;
    expect(asked()).toBe(true);
    remove();
    expect(asked()).toBe(false);
  });

  it("asks with no copy registered (the hosted studio) or without isSynced", async () => {
    const guard = await guarded();
    expect(asked()).toBe(true);
    guard.flushBeforeLeaving(async () => true);
    expect(asked()).toBe(true);
  });

  it("never saves inside beforeunload: it only reads", async () => {
    const guard = await guarded();
    const copy = fakeCopy(false);
    guard.flushBeforeLeaving(copy.flush, copy.isSynced);
    expect(asked()).toBe(true);
    expect(copy.flushed).toBe(0);
  });
});

describe("app reloads save first", () => {
  it("reloadAfterSaving saves, then reloads with the guard silent", async () => {
    const guard = await guarded();
    // Synced only after the save, so the silence comes from the save.
    const copy = fakeCopy(false);
    guard.flushBeforeLeaving(copy.flush, () => false);
    const seen: boolean[] = [];
    await guard.reloadAfterSaving(() => seen.push(asked()));
    expect(copy.flushed).toBe(1);
    expect(seen).toEqual([false]);
  });

  it("an unconfirmed save reloads with the guard in place", async () => {
    const guard = await guarded();
    const copy = fakeCopy(false, false);
    guard.flushBeforeLeaving(copy.flush, copy.isSynced);
    const seen: boolean[] = [];
    await guard.reloadAfterSaving(() => seen.push(asked()));
    expect(copy.flushed).toBe(1);
    expect(seen).toEqual([true]);
  });

  it("a stale chunk reloads through the save", async () => {
    const guard = await guarded();
    const copy = fakeCopy(false);
    guard.flushBeforeLeaving(copy.flush, () => false);
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    const { reloadForStaleChunk } = await import("../src/lazy-reload");
    const storage = new Map<string, string>();
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    expect(reloadForStaleChunk(session)).toBe(true);
    // Nothing reloads until the copy answered.
    expect(reload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(copy.flushed).toBe(1);
    expect(asked()).toBe(false);
  });

  it("a restarted server reloads once, through the save, when it answers", async () => {
    vi.useFakeTimers();
    const { reloadWhenBack } = await import("../src/supervisor/ServerRestart");
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("down"))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const reload = vi.fn(async () => {});
    const giveUp = vi.fn();
    reloadWhenBack({ giveUp, fetcher, reload });
    await vi.advanceTimersByTimeAsync(1000);
    // Still within the old listener's 1.5 s: not asked yet.
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(giveUp).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("by default the restart saves the copy before the page reloads", async () => {
    vi.useFakeTimers();
    const guard = await guarded();
    const order: string[] = [];
    const copy = fakeCopy(false);
    guard.flushBeforeLeaving(async (all) => {
      order.push(`flush all=${all}`);
      return copy.flush();
    }, copy.isSynced);
    vi.stubGlobal("location", {
      reload: () => order.push(`reload asked=${asked()}`),
    });
    const { reloadWhenBack } = await import("../src/supervisor/ServerRestart");
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    reloadWhenBack({ giveUp: vi.fn(), fetcher });
    await vi.advanceTimersByTimeAsync(3000);
    expect(order).toEqual(["flush all=true", "reload asked=false"]);
  });
});

describe("a field that commits on blur", () => {
  /** A focused field whose blur commits typed text, moving the revision. */
  function focusedField(copy: { synced: boolean }) {
    const field = { blur: vi.fn(() => void (copy.synced = false)) };
    vi.stubGlobal("document", { activeElement: field, body: {} });
    return field;
  }

  it("is committed before the guard reads the copy, so the guard asks", async () => {
    const guard = await guarded();
    const copy = fakeCopy(true);
    guard.flushBeforeLeaving(copy.flush, copy.isSynced);
    const field = focusedField(copy);
    expect(asked()).toBe(true);
    expect(field.blur).toHaveBeenCalled();
  });

  it("is committed before a save, so the save pushes it", async () => {
    const guard = await guarded();
    const copy = fakeCopy(true);
    const seen: boolean[] = [];
    guard.flushBeforeLeaving(async () => {
      seen.push(copy.synced);
      return copy.flush();
    }, copy.isSynced);
    focusedField(copy);
    expect(await guard.saveCopies()).toBe(true);
    // The flush saw the committed (unsynced) text and saved it.
    expect(seen).toEqual([false]);
  });
});

describe("Vite's development full reload", () => {
  it("awaits the save before Vite reloads, and the guard is then silent", async () => {
    const guard = await guarded();
    let release!: () => void;
    const copy = {
      synced: false,
      flush: () =>
        new Promise<boolean>((resolve) => {
          release = () => {
            copy.synced = true;
            resolve(true);
          };
        }),
    };
    guard.flushBeforeLeaving(copy.flush, () => copy.synced);
    const listeners: (() => Promise<void>)[] = [];
    guard.saveBeforeFullReload({ on: (_event, cb) => listeners.push(cb) });
    expect(listeners).toHaveLength(1);
    // What Vite 6's client does: await every listener, then reload.
    let reloaded = false;
    const viteFullReload = Promise.allSettled(listeners.map((cb) => cb())).then(
      () => (reloaded = true),
    );
    await Promise.resolve();
    expect(reloaded).toBe(false);
    release();
    await viteFullReload;
    expect(reloaded).toBe(true);
    expect(asked()).toBe(false);
  });

  it("a full reload for another HTML file, which Vite does not reload, leaves the guard on", async () => {
    const guard = await guarded();
    const copy = fakeCopy(false);
    guard.flushBeforeLeaving(copy.flush, copy.isSynced);
    const listeners: (() => Promise<void>)[] = [];
    guard.saveBeforeFullReload({ on: (_event, cb) => listeners.push(cb) });
    // Vite: full-reload with path "/scripts/preview-agent-bubble.html",
    // listeners awaited, then no pageReload() for a page that is not this one.
    await Promise.allSettled(listeners.map((cb) => cb()));
    expect(asked()).toBe(false);
    // The person edits on; the guard must still ask for that edit.
    copy.synced = false;
    expect(asked()).toBe(true);
  });

  it("does nothing outside development (no import.meta.hot)", async () => {
    const guard = await guarded();
    expect(() => guard.saveBeforeFullReload(undefined)).not.toThrow();
  });

  it("Vite's client in this checkout awaits beforeFullReload listeners", async () => {
    const { readFile } = await import("node:fs/promises");
    const client = await readFile(
      "node_modules/vite/dist/client/client.mjs",
      "utf8",
    );
    expect(client).toContain(
      'await hmrClient.notifyListeners("vite:beforeFullReload", payload);',
    );
    expect(client).toMatch(
      /async notifyListeners\(event, data\) \{[\s\S]{0,200}await Promise\.allSettled/,
    );
  });
});
