import { expect, it } from "vitest";
import type { Layer } from "../shared/director/types";
import { lanes } from "../shared/director/tracks";
import {
  arrange,
  density,
  storyboardLane,
} from "../src/director/channel-layout";
import { magnetic, snapGrid, timelinePixels } from "../src/director/snap";
import { readFileSync } from "node:fs";

const studio = () =>
  JSON.parse(readFileSync("docs/director-bundle/example/studio.json", "utf8"));

it("keeps the person's row order and puts new rows at their default place", () => {
  const defaults = ["markers", "a", "b", "c"];
  expect(arrange(defaults, [])).toEqual(defaults);
  expect(arrange(defaults, ["b", "a"])).toEqual(["markers", "b", "a", "c"]);
  // A row the project no longer has is dropped.
  expect(arrange(defaults, ["gone", "c", "a"])).toEqual([
    "markers",
    "c",
    "a",
    "b",
  ]);
});

it("names the channel density from the column width", () => {
  expect(density(320)).toBe("full");
  expect(density(180)).toBe("full");
  expect(density(179)).toBe("short");
  expect(density(72)).toBe("short");
  expect(density(71)).toBe("dots");
  expect(density(32)).toBe("dots");
});

it("follows the picture lane with the most clips, lowest on a tie", () => {
  const p = studio();
  const stack = lanes(p.layers as Layer[]);
  const story = storyboardLane(stack)!;
  expect(story.family).toBe("visual");
  expect(stack.indexOf(story)).toBe(
    stack.findIndex((l) => l.family === "visual"),
  );
  const shot = p.layers.find((l: Layer) => l.id === "photo-1");
  const more = [
    ...p.layers,
    {
      ...shot,
      id: "shot-b",
      track: "shots",
      startFrame: 0,
      durationFrames: 10,
    },
    {
      ...shot,
      id: "shot-c",
      track: "shots",
      startFrame: 10,
      durationFrames: 10,
    },
  ] as Layer[];
  expect(storyboardLane(lanes(more))!.id).toBe("shots");
});

it("snaps by mode and fits the whole piece to the width", () => {
  const p = studio();
  expect(snapGrid("frame", p)).toEqual({ step: 1, origin: 0 });
  expect(snapGrid("free", p)).toEqual({ step: 1, origin: 0 });
  expect(magnetic("free")).toBe(false);
  expect(magnetic("frame")).toBe(true);
  expect(snapGrid("beat", p).step).toBeCloseTo((30 * 60) / 120);
  p.notes = [{ id: "n", frame: 42, text: "hit" }];
  expect(snapGrid("marker", p).frames).toEqual([
    0,
    42,
    p.composition.durationFrames,
  ]);
  // Fit all is fractional and may go below the manual minimum.
  expect(
    timelinePixels(30, 90, { on: true, width: 150, frames: 180 }),
  ).toBeCloseTo(150 / 180);
  expect(timelinePixels(30, 90, { on: false, width: 150, frames: 180 })).toBe(
    3,
  );
  expect(timelinePixels(30, 9000, { on: false, width: 0, frames: 180 })).toBe(
    12,
  );
});
