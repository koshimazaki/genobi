import { expect, it } from "vitest";
import {
  PROGRAMS,
  METABALL_COLOURS,
  defaultMetaballs,
  metaballTargets,
  popMetaball,
  hitMetaball,
  frameText,
} from "../shared/ascii/programs";
it("offers three visualisers with shaded three-hue metaballs", () => {
  expect(Object.keys(PROGRAMS)).toEqual(["metaballs", "rain", "blackhole"]);
  expect(METABALL_COLOURS).toHaveLength(3);
  const colours = new Set(
    Array.from(PROGRAMS.metaballs(36, 7, 1200).cells).filter(
      (_, i) => i % 3 === 1,
    ),
  );
  expect(colours.size).toBeGreaterThan(3);
});
it("drifts without cursor attraction, hits and splits blobs with a bounded population", () => {
  const time = 1200;
  const original = metaballTargets(time);
  expect(metaballTargets(time, { pointer: { x: 0.95, y: 0.9 } })).toEqual(
    original,
  );
  for (const b of original)
    expect(hitMetaball(36, 7, time, b.x, b.y)).toBe(b.id);
  const initial = defaultMetaballs();
  const split = popMetaball(initial, 0, time);
  expect(split).toHaveLength(initial.length + 1);
  expect(split.some((b) => b.id === 0)).toBe(false);
  expect(split.slice(-2).every((b) => b.radius < initial[0].radius)).toBe(true);
  let balls = split;
  for (let i = 0; i < 200 && balls.length; i++)
    balls = popMetaball(balls, balls[0].id, time + i * 33);
  expect(balls).toHaveLength(0);
  expect(
    frameText(PROGRAMS.metaballs(36, 7, time, { balls })).replace(/\n/g, ""),
  ).toBe("⠀".repeat(36 * 7));
});
