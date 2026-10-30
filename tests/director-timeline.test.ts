import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Layer, Project } from "../shared/director/types";
import {
  alignedEdges,
  framePixels,
  gridFrame,
  timelinePatch,
} from "../shared/director/timeline";
const fixture = () =>
  JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project;
it("uses even whole-pixel frame intervals at every zoom", () => {
  for (const fps of [24, 30, 59, 120])
    for (let zoom = 50; zoom <= 220; zoom++) {
      const pixels = framePixels(fps, zoom);
      expect(Number.isInteger(pixels)).toBe(true);
      expect(pixels).toBeGreaterThanOrEqual(2);
    }
});
it("snaps absolute frame positions, including fractional beat periods", () => {
  const p = fixture(),
    l = p.layers.find((l) => l.kind === "image")!;
  const shifted = { ...l, startFrame: 62 };
  expect(timelinePatch(p, shifted, "move", 13, 15, 0)).toEqual({
    startFrame: 75,
  });
  const beat = (30 * 60) / 130;
  expect(gridFrame(100, beat)).toBe(Math.round(7 * beat));
});
it("aligns both moving clip edges with nearby starts and ends", () => {
  const p = fixture(),
    l = p.layers.find((l) => l.kind === "image")!;
  expect(timelinePatch(p, l, "move", 29, 1, 2)).toEqual({ startFrame: 90 });
  const moved = { ...l, startFrame: 40 };
  expect(timelinePatch(p, moved, "move", -9, 1, 2)).toEqual({ startFrame: 30 });
  expect(timelinePatch(p, l, "move", 29, 1, 0)).toEqual({ startFrame: 89 });
});
it("trims against the same edges and preserves video source offsets", () => {
  const p = fixture(),
    source = p.layers.find((l) => l.kind === "video")!;
  const video = {
    ...source,
    startFrame: 10,
    durationFrames: 70,
    sourceStartFrame: 10,
  } as Layer;
  expect(timelinePatch(p, video, "left", 19, 1, 2)).toMatchObject({
    startFrame: 30,
    durationFrames: 50,
    sourceStartFrame: 30,
  });
  expect(timelinePatch(p, video, "right", 9, 1, 2)).toEqual({
    durationFrames: 80,
  });
  expect(timelinePatch(p, video, "left", -100, 1, 0)).toMatchObject({
    startFrame: 0,
    sourceStartFrame: 0,
  });
});
it("bounds trims by source length and prevents empty clips", () => {
  const p = fixture(),
    source = p.layers.find((l) => l.kind === "video")!;
  const video = {
    ...source,
    startFrame: 0,
    durationFrames: 30,
    sourceStartFrame: 150,
  } as Layer;
  expect(timelinePatch(p, video, "right", 100, 1, 0)).toEqual({
    durationFrames: 30,
  });
  expect(timelinePatch(p, video, "right", -100, 1, 0)).toEqual({
    durationFrames: 1,
  });
  expect(
    timelinePatch(p, { ...video, locked: true }, "move", 100, 1, 2),
  ).toEqual({});
});
it("identifies every matching clip without moving unrelated layers", () => {
  const p = fixture(),
    image = p.layers.find((l) => l.kind === "image")!;
  const selected = { ...image, startFrame: 90 };
  const original = structuredClone(p.layers);
  const edges = alignedEdges(p.layers, selected);
  expect(edges.map((g) => g.frame)).toEqual([90, 120]);
  expect(edges[0].ids.length).toBeGreaterThan(2);
  expect(p.layers).toEqual(original);
});

it("keeps the final frame when media duration is rounded to microseconds", () => {
  const p = fixture();
  p.composition.fps = 30;
  const source = p.layers.find((l) => l.kind === "video")!;
  p.assets[source.assetId].durationSeconds = 3.233333;
  const video = {
    ...source,
    startFrame: 0,
    sourceStartFrame: 0,
    durationFrames: 90,
  };
  expect(timelinePatch(p, video, "right", 100, 1, 0)).toEqual({
    durationFrames: 97,
  });
});
