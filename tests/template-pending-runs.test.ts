// A mechanical run's record survives a reload in the tab's sessionStorage
// ({key, quoteId, state, jobId}, never the page key), so a reloaded drawer
// says a run may be in progress and asks before a clean Generate.
import { describe, expect, it } from "vitest";
import {
  CHECK_HISTORY,
  createPendingRuns,
  needsCheck,
  readStored,
  type PendingRun,
} from "../src/template-gallery/pending-runs";

const KEY = "11111111-2222-4333-8444-555555555555";
const QUOTE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

/** A Map standing in for sessionStorage, as one tab across a reload. */
function tab() {
  const items = new Map<string, string>();
  return {
    items,
    store: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    },
  };
}

const run: PendingRun = {
  templateId: "sheet-to-shot",
  idempotency: KEY,
  quoteId: QUOTE,
  state: "submitting",
};

describe("a mechanical run's record across a reload", () => {
  it("keeps the key, quote and state per template, and nothing else", () => {
    const { items, store } = tab();
    createPendingRuns(() => store).record(run);
    expect([...items]).toEqual([
      [
        "genobi.gallery.run.sheet-to-shot",
        JSON.stringify({ key: KEY, quoteId: QUOTE, state: "submitting" }),
      ],
    ]);
    // A fresh page in the same tab reads it back as restored.
    const reloaded = createPendingRuns(() => store);
    const back = reloaded.get("sheet-to-shot");
    expect(back).toEqual({ ...run, restored: true });
    expect(reloaded.get("sheet-to-shot")).toBe(back);
    expect(reloaded.get("anime-teaser")).toBeUndefined();
  });

  it("never stores the page key, even if a caller passes one", () => {
    const { items, store } = tab();
    createPendingRuns(() => store).record({
      ...run,
      state: "started",
      jobId: "job-1",
      key: "byo-secret",
    } as PendingRun & { key: string });
    const stored = [...items.values()][0];
    expect(stored).not.toContain("byo-secret");
    expect(JSON.parse(stored)).toEqual({
      key: KEY,
      quoteId: QUOTE,
      state: "started",
      jobId: "job-1",
    });
  });

  it("asks for a check after a reload until Camera's list holds the job", () => {
    const { store } = tab();
    createPendingRuns(() => store).record(run);
    const restored = createPendingRuns(() => store).get("sheet-to-shot");
    // No job yet: a run may have started.
    expect(needsCheck(restored, false)).toBe(true);
    const started = { ...restored!, state: "started" as const, jobId: "j" };
    expect(needsCheck(started, false)).toBe(true);
    expect(needsCheck(started, true)).toBe(false);
    // A record this page made is shown as it is, never as a check.
    expect(needsCheck(run, false)).toBe(false);
    expect(needsCheck(undefined, false)).toBe(false);
    expect(CHECK_HISTORY).toBe("A run may be in progress; see Camera history.");
  });

  it("clears the record once the person chooses a new run", () => {
    const { items, store } = tab();
    const runs = createPendingRuns(() => store);
    runs.record(run);
    runs.clear("sheet-to-shot");
    expect(items.size).toBe(0);
    expect(runs.get("sheet-to-shot")).toBeUndefined();
    expect(createPendingRuns(() => store).get("sheet-to-shot")).toBeUndefined();
  });

  it("works without storage, and when storage throws", () => {
    const none = createPendingRuns(() => undefined);
    none.record(run);
    expect(none.get("sheet-to-shot")).toBe(run);
    const refuse = () => {
      throw new Error("SecurityError");
    };
    const broken = createPendingRuns(() => ({
      getItem: refuse,
      setItem: refuse,
      removeItem: refuse,
    }));
    expect(broken.get("sheet-to-shot")).toBeUndefined();
    broken.record(run);
    expect(broken.get("sheet-to-shot")).toBe(run);
    expect(() => broken.clear("sheet-to-shot")).not.toThrow();
    expect(
      createPendingRuns(() => {
        throw new Error("no storage");
      }).get("x"),
    ).toBeUndefined();
  });

  it("refuses a stored record it would not have written", () => {
    const ok = JSON.stringify({ key: KEY, quoteId: QUOTE, state: "uncertain" });
    expect(readStored("t", ok)).toMatchObject({ state: "uncertain" });
    for (const raw of [
      null,
      "",
      "not json",
      JSON.stringify({ key: "x", quoteId: QUOTE, state: "started" }),
      JSON.stringify({ key: KEY, quoteId: QUOTE, state: "paid" }),
      JSON.stringify({ key: KEY, quoteId: QUOTE, state: "started", jobId: 7 }),
      JSON.stringify({
        key: KEY,
        quoteId: QUOTE,
        state: "started",
        jobId: "../x",
      }),
      "x".repeat(1001),
    ])
      expect(readStored("t", raw), String(raw).slice(0, 40)).toBeUndefined();
  });
});
