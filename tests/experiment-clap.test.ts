import { describe, expect, it } from "vitest";
import { Euler, Quaternion, Vector3 } from "three";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy, type Study } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import {
  CLAP_FRACTION,
  galleryNave,
  growInward,
  rowGap,
  STREET,
} from "../scripts/experiments/recipes-clap";

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
const CLAPS: Study[] = [
  "towers-descent",
  "cathedral-gallery",
  "cathedral-gallery-grow",
];
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

  it.skipIf(study.endsWith("-grow"))(
    "claps in x only on the bass, whatever the frame",
    () => {
      const quiet = voxels(study, 0, 30).parts,
        loud = voxels(study, 1, 30).parts;
      quiet.forEach((q, i) => {
        const l = loud[i];
        expect(l.x).toBeCloseTo(q.x * CLAP_FRACTION, 2);
        expect(l.y).toBeCloseTo(q.y, 6);
        expect(l.z).toBeCloseTo(q.z, 6);
      });
      expect(voxels(study, 1, 80).parts).toEqual(loud);
    },
  );

  it("keeps the camera out of every piece at full close along its path", () => {
    const { recipe, parts } = voxels(study, 1, 0, 193);
    const size = recipe.motion!.instances!.size;
    let nearest = Infinity;
    for (let f = 0; f < 193; f += 4) {
      const [px, py, pz] = sceneCameraAt(recipe, f)!.position;
      for (const o of parts) {
        // Distance to the box in its own frame.
        const h = [o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1].map(
          (v) => (v * o.scale * size) / 2,
        );
        const turn = new Quaternion()
          .setFromEuler(
            new Euler(o.rotationX ?? 0, o.rotation ?? 0, o.rotationZ ?? 0),
          )
          .invert();
        const local = new Vector3(px - o.x, py - o.y, pz - o.z)
          .applyQuaternion(turn)
          .toArray();
        const gap = Math.hypot(
          ...local.map((v, k) => Math.max(0, Math.abs(v) - h[k])),
        );
        nearest = Math.min(nearest, gap);
      }
    }
    expect(nearest).toBeGreaterThan(2);
  });
});

describe("cathedral-gallery-grow", () => {
  it("thickens the side stone inwards from a fixed outer face; the rest holds", () => {
    const pieces = galleryNave(),
      closed = growInward(pieces);
    let sides = 0;
    pieces.forEach(({ part, side }, i) => {
      const c = closed[i];
      const half = (p: typeof part) => (p.scale * (p.scaleX ?? 1)) / 2;
      if (!side) {
        expect(c).toEqual(part);
        return;
      }
      sides++;
      // Outer face holds; the inner face comes to a quarter of its distance.
      expect(Math.abs(c.x) + half(c)).toBeCloseTo(
        Math.abs(part.x) + half(part),
        6,
      );
      expect(Math.abs(c.x) - half(c)).toBeCloseTo(
        (Math.abs(part.x) - half(part)) * CLAP_FRACTION,
        6,
      );
      expect(c.y).toBe(part.y);
      expect(c.z).toBe(part.z);
    });
    expect(sides).toBeGreaterThan(40);
  });

  it("reaches the grown layout at full bass and the open one in silence", () => {
    const quiet = voxels("cathedral-gallery-grow", 0, 30).parts,
      loud = voxels("cathedral-gallery-grow", 1, 30).parts;
    const open = galleryNave().map((p) => p.part),
      closed = growInward(galleryNave());
    quiet.forEach((o, i) => expect(o.x).toBeCloseTo(open[i].x, 2));
    loud.forEach((o, i) => expect(o.x).toBeCloseTo(closed[i].x, 2));
  });
});

describe("the acoustic room follows the measured gap", () => {
  it("measures the tower rows' inner faces, open and closed", () => {
    const { recipe } = createStudy("towers-descent", bands(97, 0.5), dims(97));
    const [open, closed] = recipe.motion!.stateKeys;
    const inner = 2 * (STREET.rowX - STREET.towerWidth / 2);
    expect(open.room?.dimensions[0]).toBeCloseTo(inner, 3);
    expect(closed.room?.dimensions[0]).toBeCloseTo(inner * CLAP_FRACTION, 3);
    expect(rowGap([{ x: 10, y: 0, z: 0, scale: 1, scaleX: 4 }], 5)).toBe(16);
    expect(recipe.motion!.mappings).toEqual([]);
    // Loud bass closes the street: the evaluated room narrows with the towers.
    const quiet = evaluateScene(recipe, 30).room!.dimensions[0];
    const loud = evaluateScene(
      createStudy("towers-descent", bands(97, 1), dims(97)).recipe,
      30,
    ).room!.dimensions[0];
    expect(loud).toBeLessThan(quiet);
    expect(loud).toBeCloseTo(inner * CLAP_FRACTION, 1);
  });
  it("closes the nave proxy to the clap fraction", () => {
    const { recipe } = createStudy(
      "cathedral-gallery-grow",
      bands(97, 0.5),
      dims(97),
    );
    const [open, closed] = recipe.motion!.stateKeys;
    expect(open.room?.dimensions[0]).toBe(28);
    expect(closed.room?.dimensions[0]).toBe(28 * CLAP_FRACTION);
  });
});
