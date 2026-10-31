import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  cameraAt,
  defaultRecipe,
  presetRecipe,
  validateRecipe,
} from "../src/world-builder/recipe";
import { shotPatch } from "../src/world-builder/camera-shots";
import {
  framesForSeconds,
  framesForTypedSeconds,
  MOVE_SECONDS,
  reconcileDuration,
} from "../src/world-builder/take-duration";

const examples = "custom_nodes/director_world_builder/examples";
const exampleFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? exampleFiles(join(dir, entry.name))
      : entry.name.endsWith(".json")
        ? [join(dir, entry.name)]
        : [],
  );

describe("a camera move with a duration", () => {
  it("puts seconds on the 8k + 1 grid at 24 fps, within 721 frames", () => {
    expect(framesForSeconds(10)).toBe(241);
    expect(framesForSeconds(4)).toBe(97);
    expect(framesForSeconds(MOVE_SECONDS.min)).toBe(9);
    expect(framesForSeconds(MOVE_SECONDS.max)).toBe(721);
    expect(framesForSeconds(30)).toBe(721);
    for (let s = MOVE_SECONDS.min; s <= MOVE_SECONDS.max; s += 0.1) {
      const frames = framesForSeconds(s);
      expect((frames - 1) % 8).toBe(0);
      expect(Math.abs(frames / 24 - s)).toBeLessThanOrEqual(4 / 24 + 1e-9);
    }
  });

  it("derives the recipe's frames from seconds and refuses a take past 721", () => {
    const ten = validateRecipe({ seconds: 10 });
    expect(ten.frames).toBe(241);
    expect(ten.seconds).toBe(10);
    // Seconds decides even when a stale frame count rides along.
    expect(validateRecipe({ seconds: 2, frames: 241 }).frames).toBe(49);
    expect(validateRecipe({ seconds: 30 }).frames).toBe(721);
    for (const seconds of [0, 0.2, 30.5, 32, Number.NaN, "4"])
      expect(() => validateRecipe({ seconds })).toThrow();
  });

  it("keeps recipes without seconds as they were", () => {
    const old = { ...defaultRecipe } as Record<string, unknown>;
    delete old.seconds;
    const r = validateRecipe({ ...old, frames: 49 });
    expect(r.seconds).toBeNull();
    expect(r.frames).toBe(49);
    for (const file of exampleFiles(examples)) {
      const json = JSON.parse(readFileSync(file, "utf8"));
      if (json?.version !== 1 || json?.fps !== 24) continue;
      const recipe = validateRecipe(json);
      expect(recipe.seconds, file).toBeNull();
      expect(recipe.frames, file).toBe(json.frames ?? defaultRecipe.frames);
    }
  });

  it("lets a frames-only edit move seconds with it", () => {
    const ten = validateRecipe({ seconds: 10 });
    const edited = reconcileDuration(ten, { ...ten, frames: 97 });
    const r = validateRecipe(edited);
    expect(r.frames).toBe(97);
    expect(r.seconds).toBeCloseTo(97 / 24);
    // A new seconds wins over the frames that came with it.
    expect(
      validateRecipe(reconcileDuration(ten, { ...ten, seconds: 4 })).frames,
    ).toBe(97);
    // Without seconds, frames stay the source.
    const plain = validateRecipe({ frames: 49 });
    expect(reconcileDuration(plain, { ...plain, frames: 57 })).toEqual({
      ...plain,
      frames: 57,
    });
  });
});

describe("a full turn in one take", () => {
  it("validates ±360° and refuses more", () => {
    expect(validateRecipe({ orbit: 360 }).orbit).toBe(360);
    expect(validateRecipe({ orbit: -360 }).orbit).toBe(-360);
    expect(() => validateRecipe({ orbit: 361 })).toThrow(/orbit/);
  });

  it("orbits 360° over 10 s, linear in time, back to its start", () => {
    const r = validateRecipe({
      ...presetRecipe("Studio"),
      ...shotPatch("orbit360", presetRecipe("Studio"), undefined, 10),
    });
    expect(r.frames).toBe(241);
    expect(r.orbit).toBe(360);
    expect(r.cameraCurve).toBe("linear");
    const start = cameraAt(r, 0),
      end = cameraAt(r, 240);
    start.forEach((v, i) => expect(end[i]).toBeCloseTo(v, 9));
    const azimuth = (frame: number) => {
      const [x, , z] = cameraAt(r, frame);
      return Math.atan2(x - r.targetX, z - r.targetZ);
    };
    const step = (frame: number) => {
      const d = azimuth(frame + 1) - azimuth(frame);
      return Math.atan2(Math.sin(d), Math.cos(d));
    };
    // 1.5° per frame at every point of the turn: 360° / 240 frame steps.
    for (const frame of [0, 60, 119, 180, 239])
      expect((step(frame) * 180) / Math.PI).toBeCloseTo(1.5, 9);
  });
});

describe("Typed take length", () => {
  it("sets the nearest 8k + 1 frame count for typed seconds", () => {
    expect(framesForTypedSeconds("10")).toBe(241);
    expect(framesForTypedSeconds(" 4 ")).toBe(97);
    expect(framesForTypedSeconds("7.38s")).toBe(177);
    expect(framesForTypedSeconds("2,5")).toBeInstanceOf(Error);
  });
  it("clamps to the recipe range", () => {
    expect(framesForTypedSeconds("0.1")).toBe(9);
    expect(framesForTypedSeconds("60")).toBe(721);
  });
  it("refuses text that is not a positive number", () => {
    for (const text of ["", "abc", "0", "-3", "Infinity"]) {
      const result = framesForTypedSeconds(text);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/0.375 to 30.04/);
    }
  });
});
