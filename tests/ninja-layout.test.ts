import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultLayout,
  MAX_LAYOUT_BYTES,
  movePanel,
  NINJA_KEY,
  openWorkingLayout,
  RAILS_KEY,
  readWorkingRails,
  parseLayout,
  readLayout,
  resizePanel,
} from "../src/studio/ninja-layout";
afterEach(() => vi.unstubAllGlobals());
describe("portable Ninja layout", () => {
  it("keeps fine sizes, fit and packing preferences portable with strict bounds", () => {
    const layout = {
      ...defaultLayout(),
      compact: false,
      panels: [
        { id: "stage", width: "half", columns: 7, height: 448, fit: "cover" },
      ],
    };
    expect(parseLayout(JSON.stringify(layout))).toEqual(layout);
    for (const patch of [
      { columns: 3 },
      { columns: 12.5 },
      { height: 199 },
      { height: 1601 },
      { fit: "stretch" },
    ]) {
      expect(() =>
        parseLayout(
          JSON.stringify({
            ...layout,
            panels: [{ ...layout.panels[0], ...patch }],
          }),
        ),
      ).toThrow();
    }
    expect(resizePanel(3.1, 185)).toEqual({
      columns: 4,
      width: "half",
      height: 200,
    });
    expect(resizePanel(13, 1700)).toEqual({
      columns: 12,
      width: "full",
      height: 1600,
    });
    expect(resizePanel(7.1, 451).height).toBe(448);
  });
  it("splits the old embedded prompt once, preserving an intentional v2 selection", () => {
    const old = {
      format: "genobi.ninja-layout",
      version: 1,
      panels: [{ id: "inputs", width: "half", columns: 7, height: 400 }],
    };
    const migrated = parseLayout(JSON.stringify(old));
    expect(migrated.version).toBe(3);
    expect(migrated.panels).toEqual([
      { id: "prompt", width: "half", columns: 7 },
    ]);
    expect(parseLayout(JSON.stringify({ ...old, version: 2 })).panels).toEqual(
      [],
    );
  });
  it("splits combined media into independent panels without resetting sizes", () => {
    const old = {
      format: "genobi.ninja-layout",
      version: 2,
      panels: [{ id: "project", width: "half", columns: 5, height: 300 }],
    };
    expect(parseLayout(JSON.stringify(old)).panels).toEqual([
      ...old.panels,
      { id: "inspirations", width: "half", columns: 5 },
    ]);
    expect(parseLayout(JSON.stringify({ ...old, version: 3 })).panels).toEqual(
      old.panels,
    );
  });
  it("round trips panel selection, order and widths without project state", () => {
    const layout = defaultLayout();
    layout.panels = [
      { id: "dual", width: "full" },
      { id: "stage", width: "half" },
    ];
    expect(parseLayout(JSON.stringify(layout))).toEqual(layout);
    expect(
      parseLayout(JSON.stringify({ ...layout, panels: [] })).panels,
    ).toEqual([]);
    expect(() =>
      parseLayout(JSON.stringify({ ...layout, apiKey: "not-a-real-key" })),
    ).toThrow();
    expect(() =>
      parseLayout(JSON.stringify({ ...layout, project: {} })),
    ).toThrow();
  });
  it("rejects corrupt, oversized, unsupported and ambiguous imports", () => {
    for (const text of [
      "{",
      "null",
      "[]",
      " ".repeat(MAX_LAYOUT_BYTES + 1),
      JSON.stringify({ ...defaultLayout(), version: 4 }),
      JSON.stringify({
        ...defaultLayout(),
        panels: [{ id: "stage", width: "wide" }],
      }),
      JSON.stringify({
        ...defaultLayout(),
        panels: [{ id: "__proto__", width: "half" }],
      }),
      JSON.stringify({
        ...defaultLayout(),
        panels: [
          { id: "stage", width: "half" },
          { id: "stage", width: "full" },
        ],
      }),
    ])
      expect(() => parseLayout(text)).toThrow();
  });
  it("moves in both directions, retaining widths and the original layout", () => {
    const layout = defaultLayout();
    const moved = movePanel(layout, "stage", "project");
    expect(moved.panels.map((p) => p.id)).toEqual([
      "prompt",
      "tools",
      "project",
      "stage",
      "inspirations",
    ]);
    expect(movePanel(moved, "stage", "prompt")).toEqual(layout);
    expect(layout.panels[0].id).toBe("stage");
    expect(movePanel(layout, "world", "stage")).toBe(layout);
  });
  it("restores a saved layout and safely falls back for blocked or corrupt storage", () => {
    const layout = movePanel(defaultLayout(), "stage", "tools");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(layout) });
    expect(readLayout().layout).toEqual(layout);
    vi.stubGlobal("localStorage", { getItem: () => "garbage" });
    expect(readLayout().layout).toEqual(defaultLayout());
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLayout().message).toContain("unavailable");
  });
  it("keeps the saved baseline when blocked or full storage refuses an opened layout", () => {
    const baseline = defaultLayout();
    const opened = movePanel(baseline, "stage", "tools");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    expect(openWorkingLayout(opened, {}, baseline)).toEqual({
      kept: false,
      saved: baseline,
    });
    const items = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => void items.set(key, value),
    });
    expect(openWorkingLayout(opened, {}, baseline)).toEqual({
      kept: true,
      saved: opened,
    });
    expect(JSON.parse(items.get(NINJA_KEY)!)).toEqual(opened);
  });
  it("keeps an opened layout's rail choices for the next load", () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
    vi.stubGlobal("localStorage", storage);
    // Someone who never opened a saved layout keeps each workspace's default.
    expect(readWorkingRails()).toEqual({});
    const layout = movePanel(defaultLayout(), "stage", "tools");
    expect(
      openWorkingLayout(layout, { editor: false }, defaultLayout()).kept,
    ).toBe(true);
    // A reload: the arrangement and the closed Editor rail both come back.
    expect(readLayout().layout).toEqual(layout);
    expect(readWorkingRails()).toEqual({ editor: false });
    // Corrupt or unknown rail data reads as none.
    for (const text of ["{", "[]", '{"ninja":true}', '{"editor":"no"}']) {
      items.set(RAILS_KEY, text);
      expect(readWorkingRails()).toEqual({});
    }
    // A refused rails write keeps the baseline, as a refused layout write does.
    vi.stubGlobal("localStorage", {
      ...storage,
      setItem: (key: string, value: string) => {
        if (key === RAILS_KEY)
          throw new DOMException("full", "QuotaExceededError");
        items.set(key, value);
      },
    });
    const baseline = defaultLayout();
    expect(openWorkingLayout(layout, { editor: true }, baseline)).toEqual({
      kept: false,
      saved: baseline,
    });
  });
});
