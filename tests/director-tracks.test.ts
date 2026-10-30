import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Layer, Project } from "../shared/director/types";
import {
  fitStart,
  laneLabels,
  lanes,
  moveToLane,
  reorderLane,
} from "../shared/director/tracks";
import { timelinePatch } from "../shared/director/timeline";
import { splitLayer } from "../shared/director/split";
import { validateProject } from "../src/director/validate";
import { addGraphics } from "../src/director/add-graphics";

const fixture = (): Project =>
  JSON.parse(readFileSync("docs/director-bundle/example/studio.json", "utf8"));
/** photo-1 [60, 90) and photo-2 [90, 120) share one track. */
const shared = () => {
  const p = fixture();
  p.layers.find((l) => l.id === "photo-2")!.track = "photo-1";
  return p;
};
const layer = (p: Project, id: string) => p.layers.find((l) => l.id === id)!;

it("keeps one lane per layer for bundles without tracks", () => {
  const p = fixture();
  expect(lanes(p.layers).map((l) => l.id)).toEqual(p.layers.map((l) => l.id));
});

it("groups adjacent clips of one family onto a shared track", () => {
  const p = validateProject(shared());
  const all = lanes(p.layers);
  expect(all).toHaveLength(p.layers.length - 1);
  expect(all.find((l) => l.id === "photo-1")?.layers.map((l) => l.id)).toEqual([
    "photo-1",
    "photo-2",
  ]);
  const labels = laneLabels(all);
  expect(labels.get("plate")).toBe("V1");
  expect(labels.get("photo-1")).toBe("V2");
  expect(labels.get("score")).toBe("A1");
});

it("rejects overlapping, mixed-family and separated tracks", () => {
  const overlap = shared();
  layer(overlap, "photo-2").startFrame = 80;
  expect(() => validateProject(overlap)).toThrow(/overlaps/);
  const mixed = fixture();
  layer(mixed, "plate").track = "score";
  expect(() => validateProject(mixed)).toThrow(/mixes/);
  const apart = fixture();
  layer(apart, "title").track = "pulse";
  expect(() => validateProject(apart)).toThrow(/adjacent/);
  const named = fixture();
  layer(named, "plate").track = "Bad Track";
  expect(() => validateProject(named)).toThrow();
});

it("moves a clip to a new top track, then onto a matching track", () => {
  const p = fixture();
  const lifted = validateProject(moveToLane(p, "photo-2", 100, "new"));
  expect(lifted.layers.at(-1)).toMatchObject({
    id: "photo-2",
    startFrame: 100,
    track: "track-1",
  });
  expect(lifted.revision).toBe(p.revision + 1);
  const joined = validateProject(moveToLane(lifted, "photo-1", 40, "track-1"));
  expect(
    lanes(joined.layers)
      .at(-1)
      ?.layers.map((l) => l.id),
  ).toEqual(["photo-2", "photo-1"]);
  expect(() => moveToLane(p, "photo-1", 0, "score")).toThrow(/matching/);
  expect(() => moveToLane(joined, "photo-1", 90, "track-1")).toThrow(
    /overlaps/,
  );
  expect(() => moveToLane(p, "labels", 0, "new")).toThrow(/Unlock/);
});

it("finds the nearest gap a clip fits on a lane", () => {
  const p = shared();
  const fit = (desired: number) =>
    fitStart(p.layers, "photo-1", "other", 30, desired, 0, 150);
  expect(fit(100)).toBe(120);
  expect(fit(40)).toBe(30);
  expect(fit(130)).toBe(130);
  expect(fitStart(p.layers, "photo-1", "other", 100, 50, 0, 80)).toBe(
    undefined,
  );
});

it("stops trims and moves at the neighbouring clip on the same track", () => {
  const p = shared(),
    left = layer(p, "photo-1"),
    right = layer(p, "photo-2");
  expect(timelinePatch(p, right, "left", -20, 1, 0)).toEqual({
    startFrame: 90,
    durationFrames: 30,
  });
  expect(timelinePatch(p, left, "right", 20, 1, 0)).toEqual({
    durationFrames: 30,
  });
  expect(timelinePatch(p, right, "move", -20, 1, 0)).toEqual({
    startFrame: 90,
  });
  // A different target lane ignores the clip's current neighbours.
  expect(timelinePatch(p, right, "move", -20, 1, 0, "+new")).toEqual({
    startFrame: 70,
  });
});

it("keeps both halves of a split on the original track", () => {
  const p = fixture();
  const next = validateProject(splitLayer(p, "plate", 67, "plate-cut"));
  expect(layer(next, "plate-cut").track).toBe("plate");
  expect(lanes(next.layers)).toHaveLength(lanes(p.layers).length);
});

it("reorders whole lanes, never splitting a track", () => {
  const p = shared();
  const ids = (layers: Layer[]) => layers.map((l) => l.id);
  const up = reorderLane(p.layers, "photo-2", 1);
  expect(ids(up).slice(2, 6)).toEqual([
    "pulse",
    "photo-1",
    "photo-2",
    "labels",
  ]);
  validateProject({ ...p, layers: up });
  expect(reorderLane(p.layers, "score", -1)).toBe(p.layers);
});

it("adds graphics on a new lane after the original moved track", () => {
  const moved = moveToLane(fixture(), "pulse", 0, "new");
  expect(layer(moved, "pulse").track).toBe("track-1");
  const added = addGraphics(moved, "rings", 0)!;
  expect("track" in added.layer).toBe(false);
  const next = validateProject({ ...moved, layers: added.layers });
  expect(lanes(next.layers).find((l) => l.id === added.layer.id)).toBeTruthy();
});
