import { describe, it, expect } from "vitest";
import {
  cameraAt,
  defaultRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import {
  loopedClipTime,
  loopedMotionAt,
  loopedShaderSpeed,
  loopedSpin,
  loopNotes,
  loopPeriod,
  NEURO_CYCLE,
  wholeCycles,
} from "../src/world-builder/loop";

const close = (a: readonly number[], b: readonly number[], eps = 1e-9) =>
  a.every((v, i) => Math.abs(v - b[i]) <= eps);
const recipe = (patch: Partial<Recipe>) =>
  validateRecipe({ ...structuredClone(defaultRecipe), ...patch });

describe("a seamless loop", () => {
  const spin = recipe({ orbit: 360, seconds: 2, loop: true });

  it("puts 360° over 2 s on 49 frames and meets itself one step past the end", () => {
    expect(spin.frames).toBe(49);
    expect(close(cameraAt(spin, spin.frames), cameraAt(spin, 0))).toBe(true);
    expect(close(cameraAt(spin, spin.frames - 1), cameraAt(spin, 0))).toBe(
      false,
    );
  });

  it("orbits at constant speed even with the eased curve set", () => {
    const eased = recipe({
      orbit: 360,
      frames: 49,
      loop: true,
      cameraCurve: "easeInOut",
    });
    const step = (f: number) => {
      const [x0, , z0] = cameraAt(eased, f);
      const [x1, , z1] = cameraAt(eased, f + 1);
      return Math.hypot(x1 - x0, z1 - z0);
    };
    for (const f of [0, 12, 24, 47]) expect(step(f)).toBeCloseTo(step(0), 9);
    expect(step(47)).toBeCloseTo(
      Math.hypot(
        cameraAt(eased, 0)[0] - cameraAt(eased, 48)[0],
        cameraAt(eased, 0)[2] - cameraAt(eased, 48)[2],
      ),
      9,
    );
  });

  it("brings dolly and elevation back to the start at the seam", () => {
    const r = recipe({ orbit: -360, dolly: 1, elevationEnd: 40, loop: true });
    expect(close(cameraAt(r, r.frames), cameraAt(r, 0))).toBe(true);
  });

  it("leaves recipes without loop exactly as before", () => {
    const old = recipe({ orbit: 360, frames: 49, cameraCurve: "easeInOut" });
    expect("loop" in old).toBe(false);
    expect(close(cameraAt(old, 48), cameraAt(old, 0))).toBe(true);
    const off = recipe({ orbit: 90, frames: 49, loop: false });
    expect(cameraAt(off, 48)).toEqual(
      cameraAt({ ...off, loop: undefined }, 48),
    );
  });

  it("validates the flag", () => {
    expect(() => recipe({ loop: "yes" as unknown as boolean })).toThrow(/loop/);
    expect(recipe({ loop: true }).loop).toBe(true);
  });
});

describe("periodic time on the take's period", () => {
  const r = recipe({ seconds: 2, loop: true, avatar: true });
  const period = loopPeriod(r);

  it("wraps a character clip so frame 0 and frame `frames` match", () => {
    const cycle = () => 0.9;
    const start = loopedMotionAt(r, 0, cycle);
    const seam = loopedMotionAt(r, r.frames, cycle);
    expect(seam.clip).toBe(start.clip);
    expect(seam.time).toBeCloseTo(start.time, 12);
    // 2.04 s / 0.9 s rounds to 2 whole cycles, so the last frame is just short.
    expect(wholeCycles(period, 0.9)).toBe(2);
    expect(loopedMotionAt(r, r.frames - 1, cycle).time).toBeCloseTo(
      ((r.frames - 1) / r.frames) * 2 * 0.9,
      12,
    );
  });

  it("plays at least one cycle of a clip longer than the take", () => {
    expect(loopedClipTime(period / 2, period, 10)).toBeCloseTo(5, 12);
  });

  it("restarts a move list at the seam", () => {
    const list = {
      ...r,
      avatarMotion: [
        { clip: "walk", seconds: 1 },
        { clip: "idle", seconds: 1 },
      ],
    } as Recipe;
    expect(loopedMotionAt(list, list.frames, () => 1)).toEqual(
      loopedMotionAt(list, 0, () => 1),
    );
  });

  it("is untouched with loop off", () => {
    const off = { ...r, loop: false };
    expect(loopedMotionAt(off, 30, () => 0.9).time).toBeCloseTo(30 / 24, 12);
  });

  it("rounds spin and shader speed to whole cycles over the period", () => {
    for (const spin of [0.2, -1.3, 3]) {
      const turns = (loopedSpin(spin, period) * period) / (2 * Math.PI);
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
      expect(Math.sign(turns)).toBe(Math.sign(spin));
      expect(Math.abs(turns)).toBeGreaterThanOrEqual(1);
    }
    expect(loopedSpin(0, period)).toBe(0);
    const cycles = (loopedShaderSpeed(1, period) * period) / NEURO_CYCLE;
    expect(cycles).toBeCloseTo(1, 12);
    expect(loopedShaderSpeed(0, period)).toBe(0);
  });

  it("says what the loop changes", () => {
    const notes = loopNotes(
      recipe({ loop: true, orbit: 90, seconds: 2, avatar: true }),
    ).join(" ");
    expect(notes).toMatch(/not a whole turn/);
    expect(notes).toMatch(/whole number of cycles/);
    expect(
      loopNotes(
        recipe({ loop: true, avatar: true, avatarAsset: "creature" }),
      ).join(" "),
    ).toMatch(/springs start at rest/);
    expect(loopNotes(recipe({ loop: true, scene: "neuro" })).join(" ")).toMatch(
      /Neuro sky plays 1 whole cycle/,
    );
  });
});
