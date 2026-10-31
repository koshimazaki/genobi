import { describe, expect, it } from "vitest";
import {
  sampleCameraPath,
  validateCameraPath,
  type CameraPath,
} from "../shared/camera-path";
import { describeCameraPath } from "../shared/camera-path-terms";
import { CAMERA_MOVES } from "../src/world-builder/camera-moves";
import {
  recipeCameraPath,
  shotCameraPath,
} from "../src/world-builder/camera-path";
import {
  cameraAt,
  cameraTargetAt,
  cameraFovAt,
  presetRecipe,
  validateRecipe,
} from "../src/world-builder/recipe";

const studio = presetRecipe("Studio");
const atFrame = (path: CameraPath, frame: number, frames: number) =>
  sampleCameraPath(path, frame / (frames - 1));
const pose = (
  position: [number, number, number],
  target: [number, number, number] = [0, 1, 0],
  patch: Record<string, unknown> = {},
) => ({ position, target, fov: 50, ...patch });
const line = (...poses: ReturnType<typeof pose>[]) =>
  validateCameraPath({
    version: 1,
    duration: 4,
    keys: poses.map((p, i) => ({ t: i / (poses.length - 1), ...p })),
  });
const ring = (degrees: number, radius = 10, height = 1, steps = 16) =>
  line(
    ...Array.from({ length: steps + 1 }, (_, i) => {
      const a = ((degrees * i) / steps) * (Math.PI / 180);
      return pose([Math.sin(a) * radius, height, Math.cos(a) * radius]);
    }),
  );

describe("World Builder moves as camera paths", () => {
  it("retains keyed look targets, lenses and measured audio offsets through exported samples", () => {
    const recipe = validateRecipe({
      ...studio,
      frames: 17,
      bandEnvelopes: { sub: Array(17).fill(0.4), low: [], mid: [], high: [] },
      cameraMotion: {
        version: 1,
        enabled: true,
        keys: [
          {
            id: "a",
            frame: 0,
            position: [7, 8, 15],
            target: [1, 3, -2],
            fov: 38,
            easing: "easeInOut",
          },
          {
            id: "b",
            frame: 16,
            position: [3, 4, 9],
            target: [2, 1, -5],
            fov: 68,
            easing: "linear",
          },
        ],
        audio: { enabled: true, source: "sub", amount: 0.5, motion: "push" },
      },
    });
    const path = validateCameraPath(
      JSON.parse(JSON.stringify(recipeCameraPath(recipe))),
    );
    for (let frame = 0; frame < recipe.frames; frame++) {
      const sampled = atFrame(path, frame, recipe.frames);
      cameraAt(recipe, frame).forEach((n, i) =>
        expect(sampled.position[i]).toBeCloseTo(n, 10),
      );
      cameraTargetAt(recipe, frame).forEach((n, i) =>
        expect(sampled.target[i]).toBeCloseTo(n, 10),
      );
      expect(sampled.fov).toBeCloseTo(cameraFovAt(recipe, frame), 10);
    }
  });
  it("replays a recipe's eased orbit, dolly and crane exactly on every frame through JSON", () => {
    const recipe = validateRecipe({
      ...studio,
      orbit: 120,
      dolly: -0.4,
      elevationEnd: 40,
      cameraCurve: "easeInOut",
      fov: 35,
    });
    const path = validateCameraPath(
      JSON.parse(JSON.stringify(recipeCameraPath(recipe))),
    );
    expect(path.keys).toHaveLength(recipe.frames);
    expect(path.duration).toBeCloseTo((recipe.frames - 1) / recipe.fps);
    for (let frame = 0; frame < recipe.frames; frame++) {
      const p = atFrame(path, frame, recipe.frames);
      cameraAt(recipe, frame).forEach((v, i) =>
        expect(p.position[i]).toBeCloseTo(v, 9),
      );
      expect(p.target).toEqual([
        recipe.targetX,
        recipe.targetY,
        recipe.targetZ,
      ]);
      expect(p.fov).toBe(35);
    }
  });

  it("keeps a coarser path on the frame grid and close between keys", () => {
    const recipe = validateRecipe({ ...studio, orbit: 90, frames: 97 });
    const path = recipeCameraPath(recipe, { step: 8 });
    expect(path.keys).toHaveLength(13);
    for (let frame = 0; frame < recipe.frames; frame++) {
      const p = atFrame(path, frame, recipe.frames).position;
      const exact = cameraAt(recipe, frame);
      const error = Math.hypot(...p.map((v, i) => v - exact[i]));
      expect(error).toBeLessThan(frame % 8 ? 0.05 : 1e-9);
    }
    // The last frame is always keyed even when the step does not divide it.
    const odd = recipeCameraPath(recipe, { step: 7 });
    expect(odd.keys.at(-1)!.t).toBe(1);
    expect(odd.keys.at(-2)!.t).toBeCloseTo(91 / 96);
  });

  it("carries every preset shot as a valid path", () => {
    for (const move of CAMERA_MOVES) {
      const path = shotCameraPath(move.key, studio, { subject: [3, 1, -2] });
      expect(validateCameraPath(path)).toEqual(path);
      expect(path.keys[0].target[0]).toBe(3);
    }
  });
});

describe("describing a path in the documented vocabulary", () => {
  it("names World Builder preset shots by their motion", () => {
    const shot = (key: Parameters<typeof shotCameraPath>[0]) =>
      describeCameraPath(shotCameraPath(key, studio, { step: 4 })).movements;
    expect(shot("orbit60")).toBe("arc");
    expect(shot("pushIn")).toBe("dolly-in");
    expect(shot("crane")).toBe("crane");
    // FLUX has no dolly-out term; LTX calls it Pull back (Dolly out).
    expect(shot("pullOut")).toBeNull();
    expect(
      describeCameraPath(shotCameraPath("pullOut", studio), {
        model: "ltx-2.5",
      }).movements,
    ).toBe("pull-back");
    expect(shot("front")).toBeNull();
    expect(
      describeCameraPath(shotCameraPath("front", studio), { model: "ltx-2.5" })
        .movements,
    ).toBe("static");
  });

  it("separates arc from orbit and offers each model only its own terms", () => {
    expect(describeCameraPath(ring(60)).movements).toBe("arc");
    expect(describeCameraPath(ring(-180)).movements).toBe("arc");
    expect(describeCameraPath(ring(360)).movements).toBe("orbit");
    const ltx = { model: "ltx-2.5" } as const;
    expect(describeCameraPath(ring(60), ltx).movements).toBeNull();
    expect(describeCameraPath(ring(180), ltx).movements).toBe("orbit");
    expect(describeCameraPath(ring(10)).movements).toBeNull();
  });

  it("reads pan, upward tilt and trucking, and refuses what no term documents", () => {
    const pan = line(pose([0, 1, 10]), pose([0, 1, 10], [4, 1, 0]));
    expect(describeCameraPath(pan).movements).toBe("pan");
    const up = line(pose([0, 1, 10]), pose([0, 1, 10], [0, 3, 0]));
    expect(describeCameraPath(up).movements).toBe("tilt");
    const down = line(pose([0, 1, 10]), pose([0, 1, 10], [0, -1, 0]));
    expect(describeCameraPath(down).movements).toBeNull();
    const right = line(pose([0, 1, 10]), pose([4, 1, 10], [4, 1, 0]));
    expect(describeCameraPath(right).movements).toBe("trucking");
    expect(describeCameraPath(right, { model: "ltx-2.5" }).movements).toBe(
      "dolly-right",
    );
    const left = line(pose([0, 1, 10]), pose([-4, 1, 10], [-4, 1, 0]));
    expect(describeCameraPath(left, { model: "ltx-2.5" }).movements).toBe(
      "dolly-left",
    );
    const follow = line(pose([0, 1, 10]), pose([0, 1, 4], [0, 1, -6]));
    expect(describeCameraPath(follow).movements).toBe("follow");
    const zoom = line(
      pose([0, 1, 10]),
      pose([0, 1, 10], [0, 1, 0], { fov: 25 }),
    );
    expect(describeCameraPath(zoom).movements).toBeNull();
    // Orbit and push-in at once is not one documented term.
    const spiral = line(
      ...Array.from({ length: 17 }, (_, i) => {
        const a = (i / 16) * Math.PI;
        const r = 10 - i * 0.4;
        return pose([Math.sin(a) * r, 1, Math.cos(a) * r]);
      }),
    );
    expect(describeCameraPath(spiral).movements).toBeNull();
  });

  it("reads every key, so a change that returns by the end still counts", () => {
    const ltx = { model: "ltx-2.5" } as const;
    // A zoom in and back out: not Static, and no documented zoom term.
    const breathe = line(
      pose([0, 1, 10]),
      pose([0, 1, 10], [0, 1, 0], { fov: 25 }),
      pose([0, 1, 10]),
    );
    expect(describeCameraPath(breathe, ltx).movements).toBeNull();
    expect(describeCameraPath(breathe).movements).toBeNull();
    // A 60° arc with the same zoom is two motions, not Arc shot.
    const zoomingArc = line(
      ...Array.from({ length: 17 }, (_, i) => {
        const a = ((60 * i) / 16) * (Math.PI / 180);
        const fov = 50 - 25 * Math.sin((Math.PI * i) / 16);
        return pose([Math.sin(a) * 10, 1, Math.cos(a) * 10], [0, 1, 0], {
          fov,
        });
      }),
    );
    expect(describeCameraPath(zoomingArc).movements).toBeNull();
    // A push in that pulls back out is not Static either.
    const inOut = line(pose([0, 1, 10]), pose([0, 1, 4]), pose([0, 1, 10]));
    expect(describeCameraPath(inOut, ltx).movements).toBeNull();
    // A pan that swings back to where it began is not a Pan.
    const swing = line(
      pose([0, 1, 10]),
      pose([0, 1, 10], [4, 1, 0]),
      pose([0, 1, 10]),
    );
    expect(describeCameraPath(swing).movements).toBeNull();
  });

  it("treats a roll as movement with no documented term", () => {
    const ltx = { model: "ltx-2.5" } as const;
    const roll = line(
      pose([0, 1, 10], [0, 1, 0], { roll: 0 }),
      pose([0, 1, 10], [0, 1, 0], { roll: 90 }),
    );
    expect(describeCameraPath(roll, ltx).movements).toBeNull();
    const rollBack = line(
      pose([0, 1, 10], [0, 1, 0], { roll: 0 }),
      pose([0, 1, 10], [0, 1, 0], { roll: 90 }),
      pose([0, 1, 10], [0, 1, 0], { roll: 0 }),
    );
    expect(describeCameraPath(rollBack, ltx).movements).toBeNull();
    // An arc that rolls as it goes is two motions, not Arc shot.
    const rollingArc = line(
      ...ring(60).keys.map((k, i) =>
        pose(k.position, k.target, { roll: i * 3 }),
      ),
    );
    expect(describeCameraPath(rollingArc).movements).toBeNull();
    // A held Dutch angle is an angle, not a movement.
    const held = line(
      pose([0, 1, 10], [0, 1, 0], { roll: 25 }),
      pose([0, 1, 10], [0, 1, 0], { roll: 25 }),
    );
    expect(describeCameraPath(held, ltx).movements).toBe("static");
  });

  it("names the angle from the opening elevation and roll", () => {
    const at = (y: number, roll = 0) =>
      describeCameraPath(
        line(
          pose([0, y, 10], [0, 0, 0], { roll }),
          pose([0, y, 10], [0, 0, 0], { roll }),
        ),
      ).angles;
    expect(at(0)).toBe("eye-level");
    expect(at(-3)).toBe("low-angle");
    expect(at(7)).toBe("high-angle");
    expect(at(40)).toBe("birds-eye");
    expect(at(0, 25)).toBe("dutch");
    expect(at(-400)).toBeNull(); // Straight up is no documented angle.
  });

  it("names shot size only when the subject height is known", () => {
    const framed = (distance: number) =>
      describeCameraPath(
        line(
          pose([0, 1, distance], [0, 1, 0]),
          pose([0, 1, distance], [0, 1, 0]),
        ),
        { subjectHeight: 1.8 },
      )["shot-sizes"];
    // At 50° the frame is 0.93 × distance tall.
    expect(framed(0.1)).toBe("macro");
    expect(framed(0.5)).toBe("close-up");
    expect(framed(1)).toBe("medium");
    expect(framed(2.5)).toBe("full");
    expect(framed(6)).toBe("wide");
    expect(framed(20)).toBe("establishing");
    expect(describeCameraPath(ring(60))["shot-sizes"]).toBeNull();
  });
});
