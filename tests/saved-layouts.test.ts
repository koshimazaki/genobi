import { afterEach, describe, expect, it, vi } from "vitest";
import {
  freeName,
  layoutName,
  layoutsFile,
  MAX_SAVED_LAYOUTS,
  parseLayoutInput,
  parseLayoutsText,
  pickRails,
  readSavedLayouts,
  removeLayout,
  upsertLayout,
  type SavedLayout,
} from "../shared/saved-layouts";
import { defaultLayout, movePanel } from "../src/studio/ninja-layout";
import {
  deleteSavedLayout,
  loadSavedLayouts,
  putSavedLayout,
  SAVED_LAYOUTS_KEY,
} from "../src/studio/saved-layouts-client";

const NOW = "2026-10-22T10:00:00.000Z";
const arranged = movePanel(defaultLayout(), "stage", "tools");
const entry = (id: string, name: string): SavedLayout =>
  parseLayoutInput(
    id,
    { name, layout: arranged, rails: { editor: false } },
    NOW,
  );

afterEach(() => vi.unstubAllGlobals());

describe("saved layout validation", () => {
  it("cleans names and refuses empty, long or non-text names", () => {
    expect(layoutName("  Edit\tday\x00 ")).toBe("Edit day");
    for (const bad of ["", "   ", "\x01", 7, null, "x".repeat(49)])
      expect(() => layoutName(bad)).toThrow();
    expect(layoutName("é".repeat(48))).toHaveLength(48);
  });
  it("accepts a name, arrangement and rails only, with a valid id", () => {
    expect(entry("edit-day", "Edit day")).toEqual({
      id: "edit-day",
      name: "Edit day",
      layout: arranged,
      rails: { editor: false },
      updatedAt: NOW,
    });
    const body = { name: "A", layout: arranged };
    for (const [id, input] of [
      ["../x", body],
      ["UPPER", body],
      ["a".repeat(41), body],
      ["ok", { ...body, project: {} }],
      ["ok", { ...body, apiKey: "not-a-real-key" }],
      ["ok", { ...body, rails: { ninja: true } }],
      ["ok", { ...body, rails: { editor: "yes" } }],
      ["ok", { ...body, rails: [] }],
      ["ok", { ...body, layout: { ...arranged, version: 4 } }],
      ["ok", []],
      ["ok", null],
    ] as const)
      expect(() => parseLayoutInput(id, input, NOW)).toThrow();
  });
  it("migrates an older arrangement inside a saved layout", () => {
    const old = {
      format: "genobi.ninja-layout",
      version: 2,
      panels: [{ id: "project", width: "half", columns: 5 }],
    };
    expect(
      parseLayoutInput("old", { name: "Old", layout: old }, NOW).layout.panels,
    ).toEqual([
      { id: "project", width: "half", columns: 5 },
      { id: "inspirations", width: "half", columns: 5 },
    ]);
  });
  it("keeps only rail workspaces from the shell's choices", () => {
    expect(pickRails({ editor: true, ninja: false, camera: "x" })).toEqual({
      editor: true,
    });
  });
});

describe("the saved layouts list", () => {
  it("ignores corrupt, repeated and unknown entries, and caps the count", () => {
    const good = entry("a", "One");
    const value = layoutsFile([
      good,
      // Stored data is untrusted: these shapes are not SavedLayouts.
      ...([
        { ...good, id: "c", layout: { format: "nope" } },
        { ...good, id: "d", extra: true },
        "garbage",
      ] as unknown as SavedLayout[]),
      { ...good, name: "Same id" },
      { ...good, id: "b", name: "ONE" },
      ...Array.from({ length: 30 }, (_, i) => entry(`n${i}`, `Layout ${i}`)),
    ]);
    const read = readSavedLayouts(value);
    expect(read[0]).toEqual(good);
    expect(read).toHaveLength(MAX_SAVED_LAYOUTS);
    expect(read.map((l) => l.id)).not.toContain("b");
    for (const other of [null, [], "x", { format: "genobi.layouts" }, 3])
      expect(readSavedLayouts(other)).toEqual([]);
    expect(readSavedLayouts({ ...value, version: 2 })).toEqual([]);
  });
  it("adds, replaces, renames and removes, refusing taken names and a full list", () => {
    let list = upsertLayout([], entry("a", "One"));
    list = upsertLayout(list, entry("b", "Two"));
    expect(() => upsertLayout(list, entry("c", "two"))).toThrow(
      expect.objectContaining({ code: "name_taken" }),
    );
    list = upsertLayout(list, entry("a", "First"));
    expect(list.map((l) => l.name)).toEqual(["First", "Two"]);
    expect(removeLayout(list, "a").map((l) => l.id)).toEqual(["b"]);
    expect(() => removeLayout(list, "zzz")).toThrow(
      expect.objectContaining({ code: "missing" }),
    );
    const full = Array.from({ length: MAX_SAVED_LAYOUTS }, (_, i) =>
      entry(`f${i}`, `F${i}`),
    );
    expect(() => upsertLayout(full, entry("new", "New"))).toThrow(
      expect.objectContaining({ code: "full" }),
    );
    expect(freeName(list, "two")).toBe("two 2");
    expect(freeName(list, "Two", "b")).toBe("Two");
  });
  it("imports an exported file and refuses one with nothing usable", () => {
    const list = [entry("a", "One"), entry("b", "Two")];
    expect(parseLayoutsText(JSON.stringify(layoutsFile(list)))).toEqual(list);
    for (const text of ["{", "[]", JSON.stringify(layoutsFile([]))])
      expect(() => parseLayoutsText(text)).toThrow();
  });
});

describe("saved layouts in the browser", () => {
  function storage(initial?: string) {
    const items = new Map<string, string>();
    if (initial !== undefined) items.set(SAVED_LAYOUTS_KEY, initial);
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
  }
  it("falls back to this browser when the server has no layouts route", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    const local = storage();
    vi.stubGlobal("localStorage", local);
    expect(await loadSavedLayouts()).toEqual({ home: "browser", layouts: [] });
    const draft = { name: "Edit", layout: arranged, rails: { editor: true } };
    const saved = await putSavedLayout("browser", "edit", draft);
    expect(saved).toHaveLength(1);
    // A reload reads the same arrangement back, ready to apply.
    const again = await loadSavedLayouts();
    expect(again.layouts[0].layout).toEqual(arranged);
    expect(again.layouts[0].rails).toEqual({ editor: true });
    expect(await deleteSavedLayout("browser", "edit")).toEqual([]);
  });
  it("reads corrupt or blocked browser storage as no layouts", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("localStorage", storage("not json"));
    expect((await loadSavedLayouts()).layouts).toEqual([]);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(await loadSavedLayouts()).toEqual({ home: "browser", layouts: [] });
    await expect(
      putSavedLayout("browser", "x", {
        name: "X",
        layout: arranged,
        rails: {},
      }),
    ).rejects.toThrow(/Export/);
  });
  it("uses the server's list when it answers, dropping what fails the rule", async () => {
    const good = entry("a", "One");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ layouts: [good, { ...good, id: "BAD" }] }),
        ),
    );
    expect(await loadSavedLayouts()).toEqual({
      home: "server",
      layouts: [good],
    });
  });
});
