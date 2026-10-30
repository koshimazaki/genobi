import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../shared/types";
import { createRunInputStore, restoredRunInputs } from "../src/run-inputs";
import { checkRunInputs } from "../src/run-inputs-check";

const PNG = "data:image/png;base64,AAAA";
const good = {
  id: "saved",
  savedAt: Date.now(),
  bytes: 100,
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tower and a tree",
  sentDescription: "A tower and a tree",
  imageReferences: [PNG],
  imageRegions: [
    {
      id: "tree",
      box: [0, 0, 500, 500],
      action: "change",
      description: "a pine tree",
      referenceIndex: 0,
      label: [20, 30],
    },
  ],
};
const job = {
  id: "saved",
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tower and a tree",
} as Job;
const big = "A".repeat(Math.ceil((5 * 1024 * 1024) / 3) * 4 + 40);

/** One stored row behind just enough of IndexedDB for `load`. */
function fakeIndexedDb(row: unknown) {
  const later = (fn: () => void) => queueMicrotask(fn);
  const db = {
    transaction: () => {
      const tx: Record<string, unknown> = {};
      const get = { result: row } as Record<string, unknown>;
      const cursor = { result: null } as Record<string, unknown>;
      tx.objectStore = () => ({
        get: () => get,
        index: () => ({ openCursor: () => cursor }),
      });
      later(() => {
        (cursor.onsuccess as (() => void) | undefined)?.();
        (tx.oncomplete as () => void)();
      });
      return tx;
    },
  };
  return () =>
    ({
      open: () => {
        const request = { result: db } as Record<string, unknown>;
        later(() => (request.onsuccess as () => void)());
        return request;
      },
    }) as unknown as IDBFactory;
}

afterEach(() => vi.unstubAllGlobals());

describe("stored Recreate inputs are validated on read", () => {
  it("accepts the shape capture writes", () => {
    expect(checkRunInputs(good)).toEqual(good);
  });
  it.each<[string, Record<string, unknown>]>([
    ["description not a string", { description: 42 }],
    ["oversized description", { description: "x".repeat(12_001) }],
    ["sent description missing", { sentDescription: undefined }],
    ["references not an array", { imageReferences: PNG }],
    ["too many references", { imageReferences: Array(11).fill(PNG) }],
    ["a remote URL", { imageReferences: ["https://example.com/a.png"] }],
    [
      "an SVG data URL",
      { imageReferences: ["data:image/svg+xml;base64,AA=="] },
    ],
    ["a script data URL", { imageReferences: ["data:text/html;base64,AA=="] }],
    [
      "an oversized reference",
      { imageReferences: [`data:image/png;base64,${big}`] },
    ],
    ["regions not an array", { imageRegions: {} }],
    [
      "an inverted box",
      { imageRegions: [{ ...good.imageRegions[0], box: [500, 0, 0, 500] }] },
    ],
    [
      "a box off the grid",
      { imageRegions: [{ ...good.imageRegions[0], box: [0, 0, 1001, 500] }] },
    ],
    [
      "an unknown action",
      { imageRegions: [{ ...good.imageRegions[0], action: "erase" }] },
    ],
    [
      "a missing reference",
      { imageRegions: [{ ...good.imageRegions[0], referenceIndex: 3 }] },
    ],
    [
      "a bad region id",
      { imageRegions: [{ ...good.imageRegions[0], id: "<img>" }] },
    ],
    ["a non-numeric savedAt", { savedAt: "today" }],
  ])("rejects %s", async (_, patch) => {
    const row = { ...good, ...patch };
    expect(checkRunInputs(row)).toBeUndefined();
    expect(restoredRunInputs(job, row as never)).toEqual({});
    vi.stubGlobal("IDBKeyRange", { upperBound: () => null });
    const store = createRunInputStore(fakeIndexedDb(row));
    expect(await store.load("saved")).toBeUndefined();
  });
  it("rejects a non-object row from browser storage", async () => {
    vi.stubGlobal("IDBKeyRange", { upperBound: () => null });
    for (const row of ["text", 7, null, [good]]) {
      const store = createRunInputStore(fakeIndexedDb(row));
      expect(await store.load("saved")).toBeUndefined();
    }
  });
  it("loads a valid row from browser storage", async () => {
    vi.stubGlobal("IDBKeyRange", { upperBound: () => null });
    const store = createRunInputStore(fakeIndexedDb(good));
    expect(await store.load("saved")).toEqual(good);
  });
  it("replaces control characters in box descriptions", () => {
    const row = {
      ...good,
      imageRegions: [{ ...good.imageRegions[0], description: "a\u0000tree\n" }],
    };
    expect(checkRunInputs(row)?.imageRegions[0].description).toBe("a tree ");
  });
});
