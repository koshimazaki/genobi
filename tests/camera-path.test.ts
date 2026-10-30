import { describe, expect, it } from "vitest";
import {
  applyCameraEase,
  CAMERA_EASES,
  CAMERA_EASE_PRESETS,
} from "../shared/camera-ease";
import {
  CAMERA_PATH_LIMITS,
  cameraPathFromSamples,
  sampleCameraPath,
  validateCameraPath,
  type CameraPathKey,
} from "../shared/camera-path";

const key = (t: number, patch: Partial<CameraPathKey> = {}) => ({
  t,
  position: [0, 1.5, 10],
  target: [0, 1.5, 0],
  fov: 50,
  ...patch,
});
const path = (keys: unknown[], patch: Record<string, unknown> = {}) => ({
  version: 1,
  duration: 4,
  keys,
  ...patch,
});

describe("camera ease curves (ported from Holodeck)", () => {
  it("keeps Holodeck's six curves and picker order", () => {
    expect(CAMERA_EASE_PRESETS.map((p) => p.key)).toEqual([
      "easeInOutCubic",
      "smoothstep",
      "sineInOut",
      "easeOutCubic",
      "easeInCubic",
      "linear",
    ]);
    expect([...CAMERA_EASES].sort()).toEqual(
      CAMERA_EASE_PRESETS.map((p) => p.key).sort(),
    );
  });

  it("maps 0 to 0, 1 to 1 and clamps out-of-range or NaN input", () => {
    for (const ease of CAMERA_EASES) {
      expect(applyCameraEase(ease, 0)).toBeCloseTo(0, 12);
      expect(applyCameraEase(ease, 1)).toBeCloseTo(1, 12);
      expect(applyCameraEase(ease, -3)).toBeCloseTo(0, 12);
      expect(applyCameraEase(ease, 7)).toBeCloseTo(1, 12);
      expect(applyCameraEase(ease, Number.NaN)).toBeCloseTo(0, 12);
    }
  });

  it("matches Holodeck's formulas at known points", () => {
    expect(applyCameraEase("linear", 0.25)).toBe(0.25);
    expect(applyCameraEase("smoothstep", 0.25)).toBeCloseTo(0.15625);
    expect(applyCameraEase("easeInCubic", 0.5)).toBeCloseTo(0.125);
    expect(applyCameraEase("easeOutCubic", 0.5)).toBeCloseTo(0.875);
    expect(applyCameraEase("easeInOutCubic", 0.25)).toBeCloseTo(0.0625);
    expect(applyCameraEase("easeInOutCubic", 0.75)).toBeCloseTo(0.9375);
    expect(applyCameraEase("sineInOut", 0.5)).toBeCloseTo(0.5);
    for (const ease of ["smoothstep", "easeInOutCubic", "sineInOut"] as const)
      expect(applyCameraEase(ease, 0.5)).toBeCloseTo(0.5);
  });
});

describe("camera path validation", () => {
  it("returns a canonical copy with defaults and no ease on the last key", () => {
    const first = key(0);
    const out = validateCameraPath(
      path([first, key(1, { ease: "smoothstep" })]),
    );
    expect(out.keys[0]).toEqual({ ...key(0), roll: 0, ease: "linear" });
    expect(out.keys[1]).not.toHaveProperty("ease");
    expect(validateCameraPath(JSON.parse(JSON.stringify(out)))).toEqual(out);
    expect(out.keys[0].position).not.toBe(first.position);
  });

  it("rejects malformed, unbounded or unknown input", () => {
    const L = CAMERA_PATH_LIMITS;
    const ok = [key(0), key(1)];
    const bad: unknown[] = [
      null,
      [],
      "path",
      path(ok, { version: 2 }),
      path(ok, { duration: 0 }),
      path(ok, { duration: L.maxDurationSeconds + 1 }),
      path(ok, { duration: Infinity }),
      path(ok, { extra: true }),
      path([key(0)]),
      path(Array.from({ length: L.maxKeys + 1 }, (_, i) => key(i / L.maxKeys))),
      path([key(0.1), key(1)]),
      path([key(0), key(0.9)]),
      path([key(0), key(0.5), key(0.5), key(1)]),
      path([key(0), key(0.6), key(0.4), key(1)]),
      path([{ ...key(0), script: "x" }, key(1)]),
      path([key(0, { position: [0, 1] as never }), key(1)]),
      path([key(0, { position: [0, Number.NaN, 1] }), key(1)]),
      path([key(0, { target: [L.maxCoordinate + 1, 0, 0] }), key(1)]),
      path([key(0, { position: [0, 1.5, 0] }), key(1)]),
      path([key(0, { fov: L.minFov - 1 }), key(1)]),
      path([key(0, { fov: L.maxFov + 1 }), key(1)]),
      path([key(0, { roll: 181 }), key(1)]),
      path([key(0, { ease: "bounce" as never }), key(1)]),
      path([key(0, { t: "0" as never }), key(1)]),
    ];
    for (const input of bad) expect(() => validateCameraPath(input)).toThrow();
  });

  it("rejects a segment that carries the camera through its target", () => {
    // Each key keeps its distance, but halfway the camera sits on the target.
    const through = [
      key(0, { position: [0, 0, 10], target: [0, 0, 0] }),
      key(1, { position: [0, 0, -10], target: [0, 0, 0] }),
    ];
    for (const ease of ["linear", "smoothstep", "easeInCubic"] as const)
      expect(() =>
        validateCameraPath(path([{ ...through[0], ease }, through[1]])),
      ).toThrow(/between keys 0 and 1/i);
    // A moving target can cross the camera too.
    expect(() =>
      validateCameraPath(
        path([
          key(0),
          key(0.5),
          key(1, { position: [0, 1.5, 0], target: [0, 1.5, 10] }),
        ]),
      ),
    ).toThrow(/between keys 1 and 2/i);
    // Passing beside the target is fine.
    expect(() =>
      validateCameraPath(
        path([
          key(0, { position: [0, 0, 10], target: [0, 0, 0] }),
          key(1, { position: [1, 0, -10], target: [0, 0, 0] }),
        ]),
      ),
    ).not.toThrow();
  });

  it("accepts the bounds themselves", () => {
    const L = CAMERA_PATH_LIMITS;
    const keys = Array.from({ length: L.maxKeys }, (_, i) =>
      key(i / (L.maxKeys - 1), {
        position: [L.maxCoordinate, -L.maxCoordinate, 0],
        fov: i % 2 ? L.minFov : L.maxFov,
        roll: i % 2 ? L.maxRoll : -L.maxRoll,
      }),
    );
    keys[keys.length - 1].t = 1;
    expect(
      validateCameraPath(path(keys, { duration: L.maxDurationSeconds })).keys,
    ).toHaveLength(L.maxKeys);
  });
});

describe("camera path sampling", () => {
  it("interpolates position, target, fov and roll through each segment's ease", () => {
    const p = validateCameraPath(
      path([
        key(0, { ease: "easeInCubic", fov: 40 }),
        key(0.5, { position: [10, 1.5, 10], roll: 20, ease: "linear" }),
        key(1, { position: [10, 1.5, 0], target: [10, 1.5, -10] }),
      ]),
    );
    expect(sampleCameraPath(p, 0).position).toEqual([0, 1.5, 10]);
    // Halfway through the eased first segment: easeInCubic(0.5) = 0.125.
    expect(sampleCameraPath(p, 0.25).position[0]).toBeCloseTo(1.25);
    expect(sampleCameraPath(p, 0.25).fov).toBeCloseTo(41.25);
    expect(sampleCameraPath(p, 0.5).roll).toBeCloseTo(20);
    const late = sampleCameraPath(p, 0.75);
    expect(late.position[2]).toBeCloseTo(5);
    expect(late.target[0]).toBeCloseTo(5);
    expect(late.roll).toBeCloseTo(10);
    expect(sampleCameraPath(p, 2)).toEqual(sampleCameraPath(p, 1));
    expect(sampleCameraPath(p, -1)).toEqual(sampleCameraPath(p, 0));
  });

  it("builds a path from timed samples with any start offset removed", () => {
    const p = cameraPathFromSamples([
      { time: 2, position: [0, 1, 5], target: [0, 1, 0], fov: 50 },
      { time: 3, position: [1, 1, 5], target: [0, 1, 0], fov: 50 },
      { time: 6, position: [4, 1, 5], target: [0, 1, 0], fov: 50 },
    ]);
    expect(p.duration).toBe(4);
    expect(p.keys.map((k) => k.t)).toEqual([0, 0.25, 1]);
    expect(sampleCameraPath(p, 0.5).position[0]).toBeCloseTo(2);
    expect(() =>
      cameraPathFromSamples([
        { time: 0, position: [0, 1, 5], target: [0, 1, 0], fov: 50 },
      ]),
    ).toThrow();
  });
});
