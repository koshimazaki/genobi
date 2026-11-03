import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy, type Study } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import { CLAP_FRACTION } from "../scripts/experiments/recipes-clap";

const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: number) => {
  const flat = Array.from({ length: frames }, () => 0.3);
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: Array.from({ length: frames }, () => low),
      mid: [...flat],
      high: [...flat],
    },
  };
};
const CLAPS: Study[] = ["towers-descent"];
const voxels = (study: Study, low: number, frame: number, frames = 97) => {
  const { recipe } = createStudy(study, bands(frames, low), dims(frames));
  return {
    recipe,
    parts: evaluateScene(recipe, frame).objects.filter((o) =>
      o.id.startsWith("voxel-"),
    ),
  };
};

describe.each(CLAPS)("%s", (study) => {
  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (n) => {
      const { recipe, metadata } = createStudy(study, bands(n, 0.5), dims(n));
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.design).toBeTruthy();
    },
  );

  it("claps in x only on the bass, whatever the frame", () => {
    const quiet = voxels(study, 0, 30).parts,
      loud = voxels(study, 1, 30).parts;
    quiet.forEach((q, i) => {
      const l = loud[i];
      expect(l.x).toBeCloseTo(q.x * CLAP_FRACTION, 2);
      expect(l.y).toBeCloseTo(q.y, 6);
      expect(l.z).toBeCloseTo(q.z, 6);
    });
    expect(voxels(study, 1, 80).parts).toEqual(loud);
  });

  it("keeps the camera out of every piece at full close along its path", () => {
    const { recipe, parts } = voxels(study, 1, 0, 193);
    const size = recipe.motion!.instances!.size;
    let nearest = Infinity;
    for (let f = 0; f < 193; f += 4) {
      const [px, py, pz] = sceneCameraAt(recipe, f)!.position;
      for (const o of parts) {
        // Distance to the box in its own frame (pieces turn about z only).
        const h = [o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1].map(
          (v) => (v * o.scale * size) / 2,
        );
        const t = -(o.rotationZ ?? 0),
          dx = px - o.x,
          dy = py - o.y;
        const local = [
          dx * Math.cos(t) - dy * Math.sin(t),
          dx * Math.sin(t) + dy * Math.cos(t),
          pz - o.z,
        ];
        const gap = Math.hypot(
          ...local.map((v, k) => Math.max(0, Math.abs(v) - h[k])),
        );
        nearest = Math.min(nearest, gap);
      }
    }
    expect(nearest).toBeGreaterThan(2);
  });
});
