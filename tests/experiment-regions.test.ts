import { describe, expect, it } from "vitest";
import { createStudy, type Study } from "../scripts/experiments/recipes";
import { studyRegions, type Region } from "../scripts/experiments/regions";

const FRAMES = 193;
const flat = () => Array.from({ length: FRAMES }, () => 0.3);
const regionsOf = (study: Study) => {
  const { recipe } = createStudy(
    study,
    {
      envelope: flat(),
      bandEnvelopes: { sub: flat(), low: flat(), mid: flat(), high: flat() },
    },
    { width: 1024, height: 576, frames: FRAMES },
  );
  return studyRegions(study, recipe);
};
const inside = (r: Region) => {
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.w).toBeGreaterThan(0);
  expect(r.h).toBeGreaterThan(0);
  expect(r.x + r.w).toBeLessThanOrEqual(1024);
  expect(r.y + r.h).toBeLessThanOrEqual(576);
};
const centreX = (r: Region) => r.x + r.w / 2;

describe("swap regions", () => {
  it("fruit-mecha puts the robot in the middle and a fruit either side", () => {
    const regions = regionsOf("fruit-mecha");
    expect(Object.keys(regions).sort()).toEqual([
      "fruit-left",
      "fruit-right",
      "robot",
    ]);
    const { robot, "fruit-left": left, "fruit-right": right } = regions;
    for (const r of [robot, left, right]) inside(r);
    expect(Math.abs(centreX(robot) - 512)).toBeLessThan(1024 * 0.03);
    // The robot fills most of the height; the fruits sit beside it.
    expect(robot.h).toBeGreaterThan(576 * 0.75);
    expect(left.x + left.w).toBeLessThanOrEqual(centreX(robot));
    expect(right.x).toBeGreaterThanOrEqual(centreX(robot));
    expect(centreX(left)).toBeLessThan(robot.x);
    expect(centreX(right)).toBeGreaterThan(robot.x + robot.w);
  });

  it("pyramid-inside writes only the robot", () => {
    const regions = regionsOf("pyramid-inside");
    expect(Object.keys(regions)).toEqual(["robot"]);
    inside(regions.robot);
  });

  it("a single morph names one group and a study with neither writes none", () => {
    expect(Object.keys(regionsOf("fruit-apple-banana"))).toEqual(["fruit"]);
    expect(Object.keys(regionsOf("ship-mecha"))).toEqual(["ship"]);
    expect(Object.keys(regionsOf("car-mecha"))).toEqual(["car"]);
    expect(regionsOf("pulse")).toEqual({});
    expect(regionsOf("towers-descent")).toEqual({});
  });
});
