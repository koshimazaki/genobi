import { describe, expect, it } from "vitest";
import {
  createMorphComposition,
  MORPH_ASSETS,
} from "../src/world-builder/morph-asset-catalogue";
import {
  resampleMorphParts,
  partBounds,
} from "../src/world-builder/morph-resample";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { validateRecipe } from "../src/world-builder/recipe";
import { defaultMorphControl } from "../src/world-builder/scene-morph-control";
import type { SceneTransform } from "../src/world-builder/scene-state";
import { MOVE_SECONDS, TAKE_FRAMES } from "../src/world-builder/take-duration";

const volume = (parts: SceneTransform[]) =>
  parts.reduce(
    (sum, p) =>
      sum + p.scale ** 3 * (p.scaleX ?? 1) * (p.scaleY ?? 1) * (p.scaleZ ?? 1),
    0,
  );

describe("authored form composer", () => {
  it("splits occupied cuboids without changing their combined volume or bounds", () => {
    const original = [
      { x: 1, y: 2, z: 3, scale: 1, scaleX: 4, scaleZ: 2, rotation: 0.6 },
    ];
    const divided = resampleMorphParts(original, 64);
    expect(volume(divided)).toBeCloseTo(volume(original), 10);
    const bounds = partBounds(original[0]);
    for (const part of divided) {
      const actual = partBounds(part);
      for (const axis of ["x", "y", "z"] as const) {
        expect(actual.min[axis]).toBeGreaterThanOrEqual(
          bounds.min[axis] - 1e-10,
        );
        expect(actual.max[axis]).toBeLessThanOrEqual(bounds.max[axis] + 1e-10);
      }
    }
  });

  it("keeps all authored forms selectable and fresh, with stable geometry at endpoints", () => {
    expect(MORPH_ASSETS).toHaveLength(14);
    for (const asset of MORPH_ASSETS) {
      const other = asset.id === "pyramid" ? "banana" : "pyramid";
      const options = {
        assetIds: [asset.id, other],
        count: 64 as const,
        style: "direct" as const,
      };
      const recipe = createMorphComposition(options);
      expect(recipe.stageLook).toBe("dark-grid");
      expect(recipe.motion!.instances!.count).toBe(64);
      const ids = Object.keys(recipe.motion!.stateKeys[0].objects);
      for (const key of recipe.motion!.stateKeys) {
        const snapshot = evaluateScene(recipe, key.frame, { audio: false });
        expect(snapshot.objects.map((p) => p.id)).toEqual(ids);
        for (const part of snapshot.objects) {
          const authored = key.objects[part.id];
          for (const axis of ["x", "y", "z", "scale"] as const)
            expect(part[axis]).toBeCloseTo(authored[axis], 12);
        }
      }
      recipe.motion!.stateKeys[0].objects[ids[0]].x = 39;
      expect(
        createMorphComposition(options).motion!.stateKeys[0].objects[ids[0]].x,
      ).not.toBe(39);
    }
  });

  it.each([
    [128, ["banana", "papaya", "apple"]],
    [128, ["spacecraft", "mecha", "winged-mecha"]],
    [128, ["banana", "spacecraft", "mask"]],
    [256, ["pyramid", "chamber", "cathedral"]],
  ] as const)(
    "keeps %s-part sequences within the full soundtrack budget",
    (count, assetIds) => {
      const recipe = createMorphComposition({
        assetIds: [...assetIds],
        count,
        style: "scatter",
      });
      const signal = Array.from(
        { length: 241 },
        (_, i) => (Math.sin(i * 1.711) + 1) / 2,
      );
      const full = {
        ...recipe,
        envelope: signal,
        bandEnvelopes: { sub: signal, low: signal, mid: signal, high: signal },
      };
      full.motion!.morphControl = defaultMorphControl(full.motion!);
      expect(() => validateRecipe(full)).not.toThrow();
      expect(JSON.stringify(full).length).toBeLessThanOrEqual(64000);
    },
  );

  it("refuses ambiguous form selections and unknown algorithms", () => {
    const options = {
      assetIds: ["banana", "apple"],
      count: 128 as const,
      style: "direct" as const,
    };
    for (const assetIds of [
      ["banana"],
      ["banana", "banana"],
      ["unknown", "apple"],
      ["banana", "papaya", "apple", "mask", "crown"],
    ])
      expect(() => createMorphComposition({ ...options, assetIds })).toThrow();
    expect(() =>
      createMorphComposition({ ...options, style: "script" as "direct" }),
    ).toThrow();
    expect(() =>
      createMorphComposition({ ...options, count: 10000 as 128 }),
    ).toThrow();
    const recipe = createMorphComposition(options);
    expect(() =>
      validateRecipe({ ...recipe, stageLook: "remote-code" }),
    ).toThrow();
  });

  it.each([
    [["banana", "apple"], undefined, [0, 192]],
    [["banana", "papaya", "apple"], 6, [0, 72, 144]],
    [["banana", "papaya", "apple", "orange"], 8, [0, 64, 128, 192]],
  ] as const)(
    "spreads %j across the requested total duration",
    (ids, durationSeconds, frames) => {
      const recipe = createMorphComposition({
        assetIds: [...ids],
        count: 64,
        style: "direct",
        durationSeconds,
      });
      expect(recipe.motion!.stateKeys.map((key) => key.frame)).toEqual(frames);
      expect(recipe.frames).toBe(frames.at(-1)! + 1);
      expect(recipe.seconds).toBe(durationSeconds ?? 8);
      expect(recipe.cameraMotion!.keys.map((key) => key.frame)).toEqual(frames);
      expect(recipe.motion!.stateAudio!.enabled).toBe(false);
    },
  );

  it("rejects invalid total durations and explains excessive density before loading", () => {
    const options = {
      assetIds: ["banana", "papaya", "apple", "orange"],
      count: 64 as const,
      style: "direct" as const,
    };
    for (const durationSeconds of [NaN, Infinity, 0, 31])
      expect(() =>
        createMorphComposition({ ...options, durationSeconds }),
      ).toThrow(/duration/);
    expect(() => createMorphComposition({ ...options, count: 256 })).toThrow(
      /fewer blocks.*fewer states/,
    );
  });

  it("retimes a cached four-state template through the full local duration range with soundtrack room", () => {
    const options = {
      assetIds: ["banana", "papaya", "apple", "orange"],
      count: 64 as const,
      style: "scatter" as const,
    };
    const normal = createMorphComposition(options);
    const longest = createMorphComposition({
      ...options,
      durationSeconds: MOVE_SECONDS.max,
    });
    expect(longest.frames).toBe(TAKE_FRAMES.max);
    expect(longest.motion!.stateKeys.map((key) => key.frame)).toEqual([
      0, 240, 480, 720,
    ]);
    expect(longest.motion!.stateKeys.map((key) => key.objects)).toEqual(
      normal.motion!.stateKeys.map((key) => key.objects),
    );
    expect(
      longest.cameraMotion!.keys.map((key) => [
        key.position,
        key.target,
        key.fov,
      ]),
    ).toEqual(
      normal.cameraMotion!.keys.map((key) => [
        key.position,
        key.target,
        key.fov,
      ]),
    );
    const signal = Array.from(
      { length: TAKE_FRAMES.max },
      (_, i) => Math.round((Math.sin(i * 1.711) + 1) * 5000) / 10000,
    );
    expect(() =>
      validateRecipe({
        ...longest,
        envelope: signal,
        bandEnvelopes: { low: signal, mid: signal, high: signal, sub: signal },
      }),
    ).not.toThrow();
    longest.motion!.stateKeys[0].objects["voxel-000"].x = 39;
    expect(
      createMorphComposition({ ...options, durationSeconds: 2 }).motion!
        .stateKeys[0].objects["voxel-000"].x,
    ).not.toBe(39);
  });
});
