import { describe, expect, it } from "vitest";
import {
  dockReducer,
  emptyDock,
  inspectorOpen,
  newlyDocked,
  openPanels,
  parseDock,
  type DockAction,
  type DockPanel,
  type DockState,
} from "../src/world-builder/panel-dock";

const run = (...actions: DockAction[]) =>
  actions.reduce<DockState>(dockReducer, emptyDock);
const open = (key: DockPanel) => ({ type: "open", key }) as const;
const toggle = (key: DockPanel) => ({ type: "toggle", key }) as const;

describe("World Builder panel dock", () => {
  it("multi-selects: toggles add and remove panels independently", () => {
    const two = run(toggle("camera"), toggle("audio"));
    expect(two.docked).toEqual(["camera", "audio"]);
    expect(dockReducer(two, toggle("camera")).docked).toEqual(["audio"]);
  });

  it("docks at most two, replacing the oldest", () => {
    const state = run(toggle("camera"), toggle("audio"), toggle("scene"));
    expect(state.docked).toEqual(["audio", "scene"]);
    // Opening one that is already docked keeps the order.
    expect(dockReducer(state, open("audio")).docked).toEqual([
      "audio",
      "scene",
    ]);
  });

  it("counts a selected object as one of the two", () => {
    const state = run(toggle("camera"), toggle("audio"), open("object"));
    expect(state.docked).toEqual(["audio", "object"]);
  });

  it("frees the docked slot when a panel pops out", () => {
    const popped = run(
      toggle("camera"),
      toggle("audio"),
      { type: "popOut", key: "audio" },
      toggle("scene"),
    );
    expect(popped.popped).toBe("audio");
    expect(popped.docked).toEqual(["camera", "scene"]);
  });

  it("docks the popped panel back when the window closes", () => {
    const back = run(
      toggle("camera"),
      { type: "popOut", key: "camera" },
      { type: "popIn" },
    );
    expect(back).toEqual({ docked: ["camera"], popped: null, collapsed: [] });
    // Docking back respects the cap and replaces the oldest.
    const full = run(
      toggle("camera"),
      { type: "popOut", key: "camera" },
      toggle("audio"),
      toggle("scene"),
      { type: "popIn" },
    );
    expect(full.docked).toEqual(["scene", "camera"]);
  });

  it("moves the single PiP window to a second panel, docking the first", () => {
    const moved = run(
      toggle("camera"),
      toggle("audio"),
      { type: "popOut", key: "camera" },
      { type: "popOut", key: "audio" },
    );
    expect(moved.popped).toBe("audio");
    expect(moved.docked).toEqual(["camera"]);
  });

  it("closes a popped panel from its tab without docking it", () => {
    const closed = run(
      toggle("audio"),
      { type: "popOut", key: "audio" },
      toggle("audio"),
    );
    expect(closed).toEqual(emptyDock);
    expect(dockReducer(closed, { type: "popIn" })).toBe(closed);
  });

  it("collapses docked panels and unfolds one asked for again", () => {
    const folded = run(toggle("camera"), { type: "collapse", key: "camera" });
    expect(folded.collapsed).toEqual(["camera"]);
    expect(dockReducer(folded, open("camera")).collapsed).toEqual([]);
    // A panel replaced out of the dock forgets its fold.
    expect(
      run(
        toggle("camera"),
        { type: "collapse", key: "camera" },
        toggle("audio"),
        toggle("scene"),
      ).collapsed,
    ).toEqual([]);
  });

  it("restores a stored dock defensively", () => {
    expect(parseDock(null)).toEqual(emptyDock);
    expect(parseDock("not json")).toEqual(emptyDock);
    expect(
      parseDock(
        JSON.stringify({
          docked: ["camera", "nope", "camera", "audio", "scene"],
          popped: null,
          collapsed: ["scene", "camera"],
        }),
      ),
    ).toEqual({
      docked: ["audio", "scene"],
      popped: null,
      collapsed: ["scene"],
    });
    // A PiP window never survives a reload: its panel comes back docked.
    expect(
      parseDock(JSON.stringify({ docked: ["camera"], popped: "audio" })),
    ).toEqual({ docked: ["camera", "audio"], popped: null, collapsed: [] });
  });
});

describe("World Builder panel focus and column", () => {
  const restored: DockState = {
    docked: ["camera", "audio"],
    popped: null,
    collapsed: [],
  };

  it("does not focus panels restored on load, only ones opened after", () => {
    // PanelDock seeds what it has shown with the dock it loaded with.
    expect(newlyDocked(openPanels(restored), restored)).toBeUndefined();
    const next = dockReducer(restored, { type: "open", key: "scene" });
    expect(newlyDocked(openPanels(restored), next)).toBe("scene");
  });

  it("does not focus a panel docking back from its window", () => {
    const popped = dockReducer(restored, { type: "popOut", key: "audio" });
    const back = dockReducer(popped, { type: "popIn" });
    expect(newlyDocked(openPanels(popped), back)).toBeUndefined();
  });

  it("keeps the column open while the only panel is popped out", () => {
    const only = run(toggle("audio"), { type: "popOut", key: "audio" });
    expect(only.docked).toEqual([]);
    expect(inspectorOpen(only)).toBe(true);
    expect(inspectorOpen(emptyDock)).toBe(false);
  });
});
