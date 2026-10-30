import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Project } from "../shared/director/types";
import {
  beatGrid,
  beatLines,
  downbeatAt,
  FRAME_GRID,
  gridFrame,
  nudgeFrame,
} from "../shared/director/beat-grid";
import { timelinePatch } from "../shared/director/timeline";
import { validateProject } from "../src/director/validate";

const fixture = (): Project =>
  JSON.parse(readFileSync("docs/director-bundle/example/studio.json", "utf8"));

/**
 * A real song: 98.2 BPM, first downbeat at 1.30 s, cut at 24 fps. Its fitted
 * beats fall at 1.88 + k × 14.663 frames.
 */
const song = {
  ...fixture().composition,
  fps: 24,
  durationFrames: 515,
  bpm: 98.2,
  beatOffsetSeconds: 1.3,
};
const songBeat = (k: number) => 1.88 + k * 14.663;

it("keeps the old grid from frame 0 for a bundle without an offset", () => {
  const c = fixture().composition;
  expect(c.beatOffsetSeconds).toBeUndefined();
  expect(beatGrid(c)).toEqual({
    step: (c.fps * 60) / (c.bpm ?? 120),
    origin: 0,
    beatsPerBar: 4,
  });
  const { bpm: _, ...noTempo } = c;
  expect(beatGrid(noTempo).step).toBe((c.fps * 60) / 120);
});

it("draws beats from the offset, before it as well as after, with bar lines", () => {
  const lines = beatLines(song.durationFrames, beatGrid(song));
  // The first beat is the pickup before bar 1, not frame 0.
  expect(lines[0]).toEqual({ frame: 2, bar: false });
  expect(lines.filter((l) => l.bar).map((l) => l.frame)).toEqual([
    31, 90, 149, 207, 266, 324, 383, 442, 500,
  ]);
  // Every line lands on the whole frame nearest the song's fitted beat, give
  // or take the rounding of 98.2037 BPM and 1.3004 s to the values above.
  lines.forEach((l, k) =>
    expect(Math.abs(l.frame - songBeat(k))).toBeLessThan(0.55),
  );
  // The grid from frame 0 was 1.5 to 2 frames early on every beat.
  const old = beatLines(
    song.durationFrames,
    beatGrid({ ...song, beatOffsetSeconds: 0 }),
  );
  expect(old[0].frame).toBe(0);
  expect(songBeat(17) - old[17].frame).toBeGreaterThan(1.5);
});

it("marks bars by the beats per bar", () => {
  const bars = beatLines(
    120,
    beatGrid({ ...fixture().composition, fps: 30, bpm: 120, beatsPerBar: 3 }),
  )
    .filter((l) => l.bar)
    .map((l) => l.frame);
  expect(bars).toEqual([0, 45, 90]);
});

it("snaps and nudges to the offset grid", () => {
  const grid = beatGrid(song);
  expect(gridFrame(245, grid)).toBe(251);
  // The title nudged one beat from frame 237 lands on the song's beat
  // (frame 251.15), not 81 ms early on frame 249 as the frame-0 grid put it.
  expect(nudgeFrame(237, grid, 1)).toBe(251);
  expect(Math.abs(nudgeFrame(237, grid, 1) - songBeat(17))).toBeLessThan(0.5);
  expect(nudgeFrame(237, beatGrid({ ...song, beatOffsetSeconds: 0 }), 1)).toBe(
    249,
  );
  expect(nudgeFrame(251, grid, 1)).toBe(266);
  expect(nudgeFrame(251, grid, -1)).toBe(236);
  expect(nudgeFrame(2, grid, -1)).toBeLessThan(0);
  expect(nudgeFrame(10, FRAME_GRID, 1)).toBe(11);
  expect(gridFrame(100, 15)).toBe(105);
});

it("always moves a nudge, even where a fractional line rounds down onto the clip", () => {
  const grid = { step: (24 * 60) / 98.2, origin: 0 };
  // Line 2 is frame 29.33, drawn at 29.
  expect(gridFrame(29, grid)).toBe(29);
  expect(nudgeFrame(29, grid, 1)).toBe(44);
  expect(nudgeFrame(29, grid, -1)).toBe(15);
});

it("moves a clip onto the offset grid through timelinePatch", () => {
  const p = fixture();
  p.composition = { ...p.composition, ...song, durationFrames: 300 };
  const l = p.layers.find((l) => l.kind === "image")!;
  const at = { ...l, startFrame: 60 };
  const patch = timelinePatch(p, at, "move", 28, beatGrid(p.composition), 0);
  expect(patch).toEqual({ startFrame: 90 });
  // A bare step keeps the absolute grid.
  expect(timelinePatch(p, at, "move", 28, 15, 0)).toEqual({ startFrame: 90 });
  expect(timelinePatch(p, at, "move", 13, 15, 0)).toEqual({ startFrame: 75 });
});

it("puts a downbeat on a frame to the millisecond", () => {
  expect(downbeatAt(31, 24)).toBe(1.292);
  expect(Math.round(downbeatAt(31, 24) * 24)).toBe(31);
  expect(Math.round(downbeatAt(301, 120) * 120)).toBe(301);
});

it("validates old bundles and the new optional fields", () => {
  const old = fixture();
  expect(() => validateProject(old)).not.toThrow();
  const withGrid = fixture();
  withGrid.composition = {
    ...withGrid.composition,
    beatOffsetSeconds: 1.3,
    beatsPerBar: 3,
  };
  expect(validateProject(withGrid).composition.beatsPerBar).toBe(3);
  for (const bad of [
    { beatOffsetSeconds: -0.1 },
    { beatOffsetSeconds: "1.3" },
    { beatOffsetSeconds: 3601 },
    { beatsPerBar: 0 },
    { beatsPerBar: 2.5 },
    { beatsPerBar: 17 },
  ]) {
    const p = fixture();
    Object.assign(p.composition, bad);
    expect(() => validateProject(p), JSON.stringify(bad)).toThrow(
      /Invalid bundle/,
    );
  }
});
