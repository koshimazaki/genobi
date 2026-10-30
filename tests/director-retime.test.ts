import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Layer, Project } from "../shared/director/types";
import { retimeProject, rescaleFrame } from "../shared/director/retime";
import {
  gridFrame,
  markerGrid,
  nudgeFrame,
} from "../shared/director/beat-grid";
import { timelinePatch } from "../shared/director/timeline";
import { validateProject } from "../src/director/validate";
import { lanes } from "../shared/director/tracks";

const fixture = (): Project =>
  JSON.parse(readFileSync("docs/director-bundle/example/studio.json", "utf8"));

it("keeps every clip's moment in seconds at a new composition rate", () => {
  const before = fixture();
  const after = retimeProject(before, 24);
  expect(after.composition.fps).toBe(24);
  expect(after.revision).toBe(before.revision + 1);
  const seconds = (p: Project, f: number) => f / p.composition.fps;
  expect(seconds(after, after.composition.durationFrames)).toBeCloseTo(
    seconds(before, before.composition.durationFrames),
    1,
  );
  for (const [i, l] of after.layers.entries()) {
    const old = before.layers[i];
    expect(
      Math.abs(seconds(after, l.startFrame) - seconds(before, old.startFrame)),
    ).toBeLessThan(1 / 24);
    expect(l.durationFrames).toBeGreaterThan(0);
  }
  // The result is a project the validator accepts as it stands.
  expect(() => validateProject(after)).not.toThrow();
});

it("keeps shared cuts shared and adds no overlap", () => {
  const p = fixture();
  const [a] = p.layers;
  // Two clips that meet at frame 31 on one lane.
  p.layers = [
    { ...a, id: "a", track: "lane", startFrame: 0, durationFrames: 31 },
    { ...a, id: "b", track: "lane", startFrame: 31, durationFrames: 29 },
  ] as Project["layers"];
  for (const fps of [24, 25, 48, 60]) {
    const out = retimeProject(p, fps).layers;
    expect(out[0].startFrame + out[0].durationFrames).toBe(out[1].startFrame);
    expect(lanes(out)).toHaveLength(1);
  }
});

it("refuses a rate outside the schema and returns an unchanged rate as is", () => {
  const p = fixture();
  expect(() => retimeProject(p, 0)).toThrow();
  expect(() => retimeProject(p, 24.5)).toThrow();
  expect(retimeProject(p, p.composition.fps)).toBe(p);
});

it("rescales and clamps a playhead frame", () => {
  expect(rescaleFrame(30, 30, 24)).toBe(24);
  expect(rescaleFrame(15, 30, 60)).toBe(30);
});

it("moves a note with its moment and keeps it inside the composition", () => {
  const p = fixture();
  p.notes = [
    { id: "n1", frame: p.composition.durationFrames - 1, text: "end" },
  ];
  const out = retimeProject(p, 24);
  expect(out.notes![0].frame).toBeLessThan(out.composition.durationFrames);
});

it("snaps to the nearest marker and nudges marker to marker", () => {
  const grid = markerGrid([96, 0, 240, 96.4]);
  expect(grid.frames).toEqual([0, 96, 240]);
  expect(gridFrame(120, grid)).toBe(96);
  expect(gridFrame(200, grid)).toBe(240);
  expect(nudgeFrame(96, grid, 1)).toBe(240);
  expect(nudgeFrame(96, grid, -1)).toBe(0);
  // Past the last marker a nudge still moves one frame.
  expect(nudgeFrame(240, grid, 1)).toBe(241);
  // No markers: the whole-frame grid.
  expect(gridFrame(12.4, markerGrid([]))).toBe(12);
});

it("moves a clip onto a marker through the existing edit rule", () => {
  const p = fixture();
  const layer = p.layers[0];
  const free = p.composition.durationFrames - layer.durationFrames;
  const grid = markerGrid([0, Math.min(40, free)]);
  const patch = timelinePatch(
    p,
    { ...layer, locked: false },
    "move",
    37 - layer.startFrame,
    grid,
    0,
  );
  if (patch.startFrame !== undefined)
    expect(grid.frames).toContain(patch.startFrame);
});

/** The studio example with its picture plate replaced by short clips. */
function shortClips(fps: number, count: number, length: number) {
  const p = fixture();
  p.composition = { ...p.composition, fps, durationFrames: fps * 6 };
  const image = p.layers.find((l) => l.id === "photo-1")!;
  p.layers = [
    ...p.layers.filter((l) => l.kind !== "image"),
    ...Array.from(
      { length: count },
      (_, i) =>
        ({
          ...image,
          id: `short-${i}`,
          name: `Short ${i}`,
          track: "shorts",
          startFrame: i * length,
          durationFrames: length,
        }) as Layer,
    ),
  ];
  // Every layer must fit the new composition before the change.
  p.layers = p.layers.map((l) =>
    l.kind === "image"
      ? l
      : {
          ...l,
          startFrame: 0,
          durationFrames: Math.min(fps * 6, l.durationFrames),
        },
  );
  return p;
}

it("keeps short adjacent clips apart when the rate drops", () => {
  for (const [from, to, length] of [
    [60, 24, 2],
    [60, 25, 2],
    [30, 24, 1],
    [48, 24, 1],
    [60, 24, 1],
  ]) {
    const p = shortClips(from, 12, length);
    expect(() => validateProject(p)).not.toThrow();
    const out = retimeProject(p, to);
    expect(
      () => validateProject(out),
      `${from}→${to} ×${length}`,
    ).not.toThrow();
    const shorts = out.layers.filter((l) => l.track === "shorts");
    shorts.forEach((l, i) => {
      expect(l.durationFrames).toBeGreaterThanOrEqual(1);
      if (i) {
        const prev = shorts[i - 1];
        expect(l.startFrame).toBeGreaterThanOrEqual(
          prev.startFrame + prev.durationFrames,
        );
      }
    });
  }
});

it("refuses, naming the clip, when a track's short clips no longer fit", () => {
  // 180 one-frame clips fill 3 s at 60 fps; at 24 fps they need 180 frames
  // of a 72-frame composition.
  const p = shortClips(60, 180, 1);
  p.composition.durationFrames = 180;
  expect(() => retimeProject(p, 24)).toThrow(/no longer fits/);
});

it("moves a one-frame media clip's in-point back to the source's last frame", () => {
  const p = fixture();
  p.composition = { ...p.composition, fps: 60, durationFrames: 360 };
  p.assets.video.durationSeconds = 1;
  p.layers = p.layers.map((l) =>
    l.id === "plate"
      ? ({
          ...l,
          startFrame: 10,
          durationFrames: 1,
          sourceStartFrame: 59,
        } as Layer)
      : {
          ...l,
          startFrame: 0,
          durationFrames: Math.min(l.durationFrames * 2, 360),
        },
  );
  p.assets.audio.durationSeconds = 6;
  expect(() => validateProject(p)).not.toThrow();
  const out = retimeProject(p, 24);
  const plate = out.layers.find((l) => l.id === "plate")!;
  expect(plate.durationFrames).toBe(1);
  expect("sourceStartFrame" in plate && plate.sourceStartFrame).toBe(23);
  expect(() => validateProject(out)).not.toThrow();
});

it("refuses a clip whose source is shorter than one frame at the new rate", () => {
  const p = fixture();
  p.composition = { ...p.composition, fps: 60, durationFrames: 360 };
  p.assets.video.durationSeconds = 0.02;
  p.layers = p.layers.map((l) =>
    l.id === "plate"
      ? ({
          ...l,
          startFrame: 0,
          durationFrames: 1,
          sourceStartFrame: 0,
        } as Layer)
      : l,
  );
  const name = p.layers.find((l) => l.id === "plate")!.name;
  expect(() => retimeProject(p, 24)).toThrow(
    `${name}'s source is shorter than one frame`,
  );
});
