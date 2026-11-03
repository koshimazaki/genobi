import { describe, expect, it } from "vitest";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy, type Study } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import {
  BOOTH,
  BOOTH_CLOSED,
  HALL,
  WALLS_BLEND,
  WALLS_CLOSED,
} from "../scripts/experiments/recipes-walls";

const WALLS = ["party-walls", "studio-walls"] as const;
const ROOMS = { "party-walls": HALL, "studio-walls": BOOTH } as const;
const CLOSED = { "party-walls": WALLS_CLOSED, "studio-walls": BOOTH_CLOSED };
const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: (i: number) => number) => {
  const flat = Array.from({ length: frames }, () => 0.3);
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: Array.from({ length: frames }, (_, i) => low(i)),
      mid: [...flat],
      high: [...flat],
    },
  };
};
/** The study as captured: `--motion-gain 2` doubles the blend amount. */
const captured = (study: Study, low: number, frames = 97) => {
  const { recipe } = createStudy(
    study,
    bands(frames, () => low),
    dims(frames),
  );
  recipe.motion!.morphControl!.progress.amount *= 2;
  return recipe;
};
const voxels = (recipe: ReturnType<typeof captured>, frame: number) =>
  evaluateScene(recipe, frame).objects.filter((o) => o.id.startsWith("voxel-"));

describe.each(WALLS)("%s", (study) => {
  it.each([97, 193, 241])("fits the recipe bound at %i frames", (frames) => {
    const { recipe, metadata } = createStudy(
      study,
      bands(frames, (i) => 0.1 + ((i * 13) % 89) / 100),
      dims(frames),
    );
    expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
    expect(metadata.design).toBeTruthy();
    expect(recipe.motion!.morphControl!.progress.amount).toBe(WALLS_BLEND);
    expect(recipe.avatar && recipe.avatarAsset).toBe("mannequin");
  });

  it("is the open layout at zero bass and the closed one at full, x only", () => {
    const { recipe } = createStudy(
      study,
      bands(97, () => 0),
      dims(97),
    );
    const [open, closed] = recipe.motion!.stateKeys;
    const quiet = voxels(captured(study, 0), 30),
      loud = voxels(captured(study, 1), 30);
    expect(quiet.length).toBe(Object.keys(open.objects).length);
    quiet.forEach((q) => {
      const o = open.objects[q.id],
        c = closed.objects[q.id],
        l = loud.find((p) => p.id === q.id)!;
      for (const axis of ["x", "y", "z"] as const) {
        expect(q[axis]).toBeCloseTo(o[axis], 6);
        expect(l[axis]).toBeCloseTo(c[axis], 6);
      }
      // Closed is the open piece pulled in sideways: same height and depth.
      expect(l.x).toBeCloseTo(q.x * CLOSED[study], 2);
      expect(l.y).toBeCloseTo(q.y, 6);
      expect(l.z).toBeCloseTo(q.z, 6);
    });
    // The side walls close to a quarter of the open width.
    const span = (parts: typeof quiet) =>
      Math.max(...parts.map((p) => p.x)) - Math.min(...parts.map((p) => p.x));
    expect(span(loud) / span(quiet)).toBeCloseTo(CLOSED[study], 2);
    // The reverb box narrows on the same bars, and the clock never moves it.
    const room = (r: ReturnType<typeof captured>) =>
      evaluateScene(r, 30).room!.dimensions;
    expect(room(captured(study, 1))[0]).toBeLessThan(
      room(captured(study, 0))[0],
    );
    expect(room(captured(study, 1))[2]).toBeLessThan(
      room(captured(study, 0))[2],
    );
    expect(voxels(captured(study, 1), 80)).toEqual(loud);
    // As authored (no capture gain) full bass reaches the closed layout.
    const authored = createStudy(
      study,
      bands(97, () => 1),
      dims(97),
    ).recipe;
    const side = voxels(authored, 30).find((p) => p.id === quiet[1].id)!;
    expect(side.x).toBeCloseTo(
      quiet[1].x * (1 - Math.min(1, WALLS_BLEND) * (1 - CLOSED[study])),
      2,
    );
  });

  it("holds the camera still, with no rotation, whatever the music does", () => {
    const recipe = createStudy(
      study,
      bands(193, (i) => (i % 9) / 8),
      dims(193),
    ).recipe;
    expect(recipe.motion!.rotation).toBeUndefined();
    expect(recipe.cameraMotion!.audio.enabled).toBe(false);
    const first = sceneCameraAt(recipe, 0)!;
    for (const frame of [17, 48, 96, 150, 192])
      expect(sceneCameraAt(recipe, frame)).toEqual(first);
  });

  it("keeps the camera above every wall and clear of the closed room", () => {
    const { height } = ROOMS[study];
    for (const low of [0, 0.5, 1]) {
      const recipe = captured(study, low, 193);
      const cam = sceneCameraAt(recipe, 100)!.position;
      for (const o of voxels(recipe, 100)) {
        const top = o.y + ((o.scaleY ?? 1) * o.scale) / 2;
        expect(top).toBeLessThanOrEqual(height + 0.01);
        expect(cam[1]).toBeGreaterThan(top + 0.4);
      }
      // The figure stands inside the closed walls.
      const half = (ROOMS[study].width * CLOSED[study]) / 2;
      expect(Math.abs(recipe.avatarPose.x)).toBeLessThan(half);
      expect(Math.abs(recipe.avatarPose.z)).toBeLessThan(
        ROOMS[study].length / 2,
      );
    }
  });

  it("never brings a piece into the figure, even fully closed", () => {
    // A standing figure with its arms down: 0.3 m either side of its centre,
    // 0.2 m front to back, 1.8 m tall; the floor slab is under its feet.
    for (const low of [0, 1]) {
      const recipe = captured(study, low, 193);
      const pose = recipe.avatarPose;
      for (const o of voxels(recipe, 100)) {
        const h = [o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1].map(
          (v) => (v * o.scale) / 2,
        );
        if (o.y + h[1] < 0.15) continue;
        const apart =
          Math.abs(o.x - pose.x) > h[0] + 0.3 ||
          Math.abs(o.z - pose.z) > h[2] + 0.2 ||
          o.y - h[1] > 1.8;
        expect(apart, o.id).toBe(true);
      }
    }
  });
});
