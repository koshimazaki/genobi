import { describe, expect, it } from "vitest";
import {
  cameraAt,
  cameraTargetAt,
  defaultRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import {
  createSceneLoopBank,
  saveSceneLoopSlot,
  composeSceneLoop,
  validateSceneLoopBank,
} from "../src/world-builder/scene-loop";
import { captureSceneState } from "../src/world-builder/scene-state-snapshot";
import { reverseSceneTravel } from "../src/world-builder/scene-camera";
import { resampleMorphParts } from "../src/world-builder/morph-resample";
import { scaledAxes } from "../src/world-builder/scene-contract";

function bank() {
  const source = validateRecipe(structuredClone(defaultRecipe));
  return saveSceneLoopSlot(
    saveSceneLoopSlot(createSceneLoopBank(), 0, source, 0),
    1,
    source,
    0,
  );
}

function namedCamera(path = true): Recipe {
  const source = createMotionPreset("city-to-loft");
  return validateRecipe({
    ...source,
    cameraShot: "orbit",
    cameraCurve: "linear",
    radius: 10,
    elevation: 0,
    azimuth: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    orbit: 360,
    dolly: 0,
    elevationEnd: null,
    cameraMotion: path ? { ...source.cameraMotion, enabled: false } : undefined,
  });
}

const audioOff = {
  enabled: false,
  source: "sub" as const,
  amount: 0.4,
  motion: "push" as const,
};
const silence = {
  envelope: [],
  bandEnvelopes: { sub: [], low: [], mid: [], high: [] },
};

describe("analytic named camera plus loop modifiers", () => {
  it.each([false, true])(
    "keeps no-op modifiers exactly neutral with a disabled path present=%s",
    (path) => {
      const result = composeSceneLoop(bank(), {
        camera: namedCamera(path),
        cameraOrbit: { axis: "y", turns: 0 },
        cameraAudio: audioOff,
      });
      const plain = { ...result, cameraMotion: undefined };
      expect(result.cameraMotion?.enabled ?? false).toBe(false);
      for (const frame of [
        0,
        result.frames / 4,
        result.frames / 2,
        result.frames - 1,
      ])
        expect(cameraAt(result, frame)).toEqual(cameraAt(plain, frame));
    },
  );

  it("preserves the full analytic360degree path when adding a bounded audio push", () => {
    const signals = Array(241).fill(1);
    const result = composeSceneLoop(bank(), {
      camera: namedCamera(),
      audio: {
        ...silence,
        bandEnvelopes: { ...silence.bandEnvelopes, sub: signals },
      },
      cameraAudio: { ...audioOff, enabled: true, amount: 0.5 },
    });
    expect(result.cameraMotion!.enabled).toBe(true);
    expect(result.cameraMotion!.base).toBe("legacy");
    const quarter = result.frames / 4,
      half = result.frames / 2;
    const atQuarter = cameraAt(result, quarter);
    expect(atQuarter[0]).toBeCloseTo(9.5, 12);
    expect(atQuarter[1]).toBe(0);
    expect(atQuarter[2]).toBeCloseTo(0, 12);
    expect(cameraAt(result, half)[2]).toBeCloseTo(-9.5, 12);
    expect(cameraTargetAt(result, quarter)).toEqual([0, 0, 0]);
    const neutral = { ...result, ...silence };
    const analytic = { ...neutral, cameraMotion: undefined };
    expect(cameraAt(neutral, quarter)).toEqual(cameraAt(analytic, quarter));
    cameraAt(result, half);
    cameraAt(result, 0);
    expect(cameraAt(result, quarter)).toEqual(atQuarter);
  });

  it("adds a full Y orbit analytically and turns a paired state save into actual keyed views", () => {
    const result = composeSceneLoop(bank(), {
      camera: namedCamera(),
      cameraOrbit: { axis: "y", turns: 1 },
    });
    const quarter = result.frames / 4;
    const position = cameraAt(result, quarter);
    expect(position[0]).toBeCloseTo(0, 12);
    expect(position[2]).toBeCloseTo(-10, 12);
    expect(() => reverseSceneTravel(result)).toThrow(/analytic/);
    const saved = captureSceneState(result, quarter, {
      targetStateId: "loop-B",
    });
    expect(saved.cameraMotion!.base ?? "keys").toBe("keys");
    expect(saved.cameraMotion!.orbit).toBeUndefined();
    expect(cameraAt(saved, saved.motion!.stateKeys[1].frame)).toEqual(position);
  });

  it("validates the camera mode and refuses an analytic snapshot masquerading as a fixed view", () => {
    const result = composeSceneLoop(bank());
    expect(() =>
      validateRecipe({
        ...result,
        cameraMotion: { ...result.cameraMotion, base: ["legacy"] },
      }),
    ).toThrow();
    const stored = bank();
    stored.slots[0]!.recipe.cameraMotion!.base = "legacy";
    expect(() => validateSceneLoopBank(stored)).toThrow();
  });
});

it("preserves tiny visible voxel volume while resampling to a larger retained set", () => {
  const source = {
    x: 0,
    y: 1,
    z: 0,
    scale: 1,
    presence: 0.001,
    color: "#ff0000",
  };
  const parts = resampleMorphParts([source], 2);
  const volume = (part: typeof source) =>
    scaledAxes(part).reduce((a, b) => a * b, 1);
  const result = parts.reduce(
    (sum, part) => sum + volume(part as typeof source),
    0,
  );
  expect(result / volume(source)).toBeCloseTo(1, 12);
  expect(parts.every((part) => (part.presence ?? 1) < 1)).toBe(true);
  expect(parts.every((part) => part.color === source.color)).toBe(true);
});
