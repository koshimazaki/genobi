import { describe, expect, it } from "vitest";
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { createMorphComposition } from "../src/world-builder/morph-asset-catalogue";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  type Recipe,
} from "../src/world-builder/recipe";

/** Test actual oriented corners through Three's camera, independently of fitting. */
function projectedExtent(recipe: Recipe, frame: number) {
  const camera = new PerspectiveCamera(
    cameraFovAt(recipe, frame),
    recipe.width / recipe.height,
    0.05,
    600,
  );
  camera.position.fromArray(cameraAt(recipe, frame));
  camera.lookAt(...cameraTargetAt(recipe, frame));
  camera.updateMatrixWorld();
  let xy = 0,
    near = 1,
    far = -1;
  for (const part of evaluateScene(recipe, frame, { audio: false }).objects) {
    const rotation = new Euler(
      part.rotationX ?? 0,
      part.rotation ?? 0,
      part.rotationZ ?? 0,
    );
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5]) {
          const point = new Vector3(
            x * part.scale * (part.scaleX ?? 1),
            y * part.scale * (part.scaleY ?? 1),
            z * part.scale * (part.scaleZ ?? 1),
          )
            .applyEuler(rotation)
            .add(new Vector3(part.x, part.y, part.z))
            .project(camera);
          xy = Math.max(xy, Math.abs(point.x), Math.abs(point.y));
          near = Math.min(near, point.z);
          far = Math.max(far, point.z);
        }
  }
  return { xy, near, far };
}

describe("morph composition framing", () => {
  for (const [count, assetIds] of [
    [256, ["pyramid", "chamber", "cathedral"]],
    [128, ["spacecraft", "mecha", "winged-mecha"]],
    [64, ["palms", "chamber"]],
  ] as const)
    it.each(["direct", "scatter", "twist", "assemble"] as const)(
      `frames ${count}-part ${assetIds.join(" / ")} with %s paths at integer and half frames`,
      (style) => {
        const recipe = createMorphComposition({
          assetIds: [...assetIds],
          count,
          style,
        });
        expect(recipe.cameraMotion?.enabled).toBe(true);
        expect(recipe.cameraMotion?.keys).toHaveLength(assetIds.length);
        expect(recipe.cameraMotion?.audio.enabled).toBe(false);
        let peak = 0;
        for (let frame = 0; frame <= recipe.frames - 1; frame += 0.5) {
          const extent = projectedExtent(recipe, frame);
          peak = Math.max(peak, extent.xy);
          expect(Number.isFinite(extent.xy)).toBe(true);
          expect(extent.near).toBeGreaterThan(-1);
          expect(extent.far).toBeLessThan(1);
        }
        // The solver fits sampled paths to 0.8; fractional samples retain
        // a real margin despite camera rounding and curved/scattered paths.
        expect(peak).toBeLessThan(0.85);
        const middle = projectedExtent(recipe, (recipe.frames - 1) / 2 + 0.5);
        projectedExtent(recipe, 0);
        projectedExtent(recipe, recipe.frames - 1);
        expect(projectedExtent(recipe, (recipe.frames - 1) / 2 + 0.5)).toEqual(
          middle,
        );
      },
    );

  it.each(["direct", "scatter", "twist", "assemble"] as const)(
    "keeps %s morph-plane selections in view independently of the timeline",
    (style) => {
      const recipe = createMorphComposition({
        assetIds: ["spacecraft", "mecha", "winged-mecha"],
        count: 128,
        style,
      });
      const control = recipe.motion!.morphControl!;
      control.enabled = true;
      control.progress.amount = 0;
      let peak = 0;
      for (const frame of [0, 48.5, 96, 144.5, 192])
        for (const progress of [0, 0.25, 0.5, 0.75, 1])
          for (const target of [0, 0.5, 1]) {
            control.progress.position = progress;
            control.target.position = target;
            const extent = projectedExtent(recipe, frame);
            peak = Math.max(peak, extent.xy);
            expect(extent.near).toBeGreaterThan(-1);
            expect(extent.far).toBeLessThan(1);
          }
      expect(peak).toBeLessThan(0.95);
    },
  );
});
