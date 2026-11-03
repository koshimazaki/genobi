import { describe, expect, it } from "vitest";
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { avatarPoseAt } from "../src/world-builder/avatar-path";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { evaluateAcousticEnvironment } from "../src/world-builder/evaluate-acoustic-environment";
import { validateMorphRecipe } from "../src/world-builder/morph-budget";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  validateRecipe,
  type Prop,
} from "../src/world-builder/recipe";
import {
  avenueParts,
  descentParts,
} from "../src/world-builder/story-descent-layout";
import {
  createStoryPreset,
  STORY_PRESETS,
} from "../src/world-builder/story-presets";
import { reconcileDuration } from "../src/world-builder/take-duration";
import { resizeScene, sceneSizeBounds } from "../src/world-builder/scene-size";
import { withDescentView } from "../src/world-builder/story-camera";

function transform(p: Prop) {
  return new Matrix4().compose(
    new Vector3(p.x, p.y, p.z),
    new Quaternion().setFromEuler(
      new Euler(p.rotationX ?? 0, p.rotation ?? 0, p.rotationZ ?? 0),
    ),
    new Vector3(
      p.scale * (p.scaleX ?? 1),
      p.scale * (p.scaleY ?? 1),
      p.scale * (p.scaleZ ?? 1),
    ),
  );
}

function contains(p: Prop, point: Vector3, radius: number) {
  const local = point.clone().applyMatrix4(transform(p).invert());
  return [local.x, local.y, local.z].every(
    (v, axis) =>
      Math.abs(v) <
      0.5 + radius / (p.scale * ([p.scaleX, p.scaleY, p.scaleZ][axis] ?? 1)),
  );
}

function expectSameGeometry(a: Prop, b: Prop) {
  const before = transform(a).elements,
    after = transform(b).elements;
  before.forEach((value, i) => expect(after[i]).toBeCloseTo(value, 9));
  expect([a.id, a.shape, a.color]).toEqual([b.id, b.shape, b.color]);
}

describe("human-scale continuous story presets", () => {
  it("allows every advertised size endpoint without aliasing repeated rest states", () => {
    for (const { id } of STORY_PRESETS) {
      const recipe = createStoryPreset(id);
      const bounds = sceneSizeBounds(recipe);
      for (const factor of [bounds.min, bounds.max])
        expect(() => resizeScene(recipe, factor)).not.toThrow();
      if (recipe.loop) {
        const keys = recipe.motion!.stateKeys;
        const first = keys[0].objects["voxel-000"];
        const last = keys.at(-1)!.objects["voxel-000"];
        expect(first).toEqual(last);
        expect(first).not.toBe(last);
      }
    }
  });

  it("provides fresh recipes and leaves space for five measured signals at 30 seconds", () => {
    expect(new Set(STORY_PRESETS.map(({ id }) => id)).size).toBe(2);
    for (const { id } of STORY_PRESETS) {
      const recipe = createStoryPreset(id);
      expect(validateRecipe(recipe)).toEqual(recipe);
      expect(recipe.avatar).toBe(id === "bass-avenue");
      expect(recipe.avatarAsset).toBe("mannequin");
      expect(recipe.audioRoutes).toEqual([]);
      expect(recipe.envelope).toEqual([]);
      expect(recipe.motion!.mappings).toEqual([]);
      expect(recipe.cameraMotion!.followMorph).toBe(false);
      expect(recipe.cameraMotion!.audio.enabled).toBe(false);
      const prolonged = validateMorphRecipe(
        reconcileDuration(recipe, { ...recipe, seconds: 30 }),
      );
      expect(prolonged.frames).toBe(721);
      const signal = Array.from(
        { length: 721 },
        (_, i) => Math.round((1 + Math.sin(i * 1.711)) * 5000) / 10000,
      );
      const prepared = validateRecipe({
        ...prolonged,
        envelope: signal,
        bandEnvelopes: { sub: signal, low: signal, mid: signal, high: signal },
      });
      expect(JSON.stringify(prepared).length).toBeLessThan(64_000);
      recipe.motion!.stateKeys[0].label = "Edited";
      expect(createStoryPreset(id).motion!.stateKeys[0].label).toBe(
        "Street at rest",
      );
    }
    expect(() => createStoryPreset("missing")).toThrow(/Unknown story preset/);
  });

  it("keeps part identities and material assignments deterministic during reverse seeks", () => {
    for (const { id } of STORY_PRESETS) {
      const recipe = createStoryPreset(id),
        before = structuredClone(recipe);
      const frames = [
        0,
        Math.floor(recipe.frames / 4),
        Math.floor(recipe.frames / 2),
        recipe.frames - 1,
      ];
      const snapshots = frames.map((frame) => evaluateScene(recipe, frame));
      const identities = snapshots[0].objects.map((p) => [
        p.id,
        p.shape,
        p.color,
      ]);
      for (let i = frames.length - 1; i >= 0; i--) {
        expect(evaluateScene(recipe, frames[i])).toEqual(snapshots[i]);
        expect(
          snapshots[i].objects.map((p) => [p.id, p.shape, p.color]),
        ).toEqual(identities);
      }
      expect(recipe).toEqual(before);
    }
  });

  it("moves only towers for bass and taxis for highs, preserving camera and enclosure sizes", () => {
    for (const { id } of STORY_PRESETS) {
      const recipe = createStoryPreset(id);
      const parts = id === "endless-descent" ? descentParts() : avenueParts();
      const neutral = evaluateScene(recipe, 0).objects;
      for (const [source, role] of [
        ["low", "tower"],
        ["high", "taxi"],
      ] as const) {
        const driven = structuredClone(recipe);
        driven.bandEnvelopes[source] = Array(recipe.frames).fill(1);
        const objects = evaluateScene(driven, 0).objects;
        expect(
          objects.filter((_, index) => parts[index].role === role),
        ).not.toEqual(neutral.filter((_, index) => parts[index].role === role));
        parts.forEach((part, index) => {
          if (part.role !== role)
            expectSameGeometry(neutral[index], objects[index]);
        });
        for (const frame of [0, 192, 288, 384].filter(
          (f) => f < recipe.frames,
        )) {
          expect(cameraAt(driven, frame)).toEqual(cameraAt(recipe, frame));
          expect(cameraTargetAt(driven, frame)).toEqual(
            cameraTargetAt(recipe, frame),
          );
          expect(avatarPoseAt(driven, frame)).toEqual(
            avatarPoseAt(recipe, frame),
          );
          expect(evaluateAcousticEnvironment(driven, frame)).toEqual(
            evaluateAcousticEnvironment(recipe, frame),
          );
        }
        expect(evaluateScene(driven, 0, { audio: false }).objects).toEqual(
          neutral,
        );
      }
    }
  });

  it("keeps floors and interiors fixed during the entire authored and audio-driven take", () => {
    const recipe = createStoryPreset("endless-descent"),
      parts = descentParts();
    const first = evaluateScene(recipe, 0).objects;
    recipe.bandEnvelopes.low = Array(recipe.frames).fill(0.7);
    recipe.bandEnvelopes.high = Array(recipe.frames).fill(0.4);
    for (const frame of [0, 48, 96, 192, 240, 288, 336, 384]) {
      const evaluated = evaluateScene(recipe, frame).objects;
      parts.forEach((part, index) => {
        if (part.role === "structure" || part.role === "trim")
          expectSameGeometry(first[index], evaluated[index]);
      });
    }
  });

  it("descends continuously through clear apertures with a visible 1.8 metre reference", () => {
    const recipe = withDescentView(
      createStoryPreset("endless-descent"),
      "follow",
    );
    expect(recipe.seconds).toBe(16);
    expect(recipe.frames).toBe(385);
    expect(recipe.loop).toBe(false);
    const camera = new PerspectiveCamera(
      60,
      recipe.width / recipe.height,
      0.05,
      600,
    );
    let previous = new Vector3(...cameraAt(recipe, 0));
    let previousFoot = avatarPoseAt(recipe, 0).y;
    for (let frame = 0; frame < recipe.frames; frame++) {
      const position = new Vector3(...cameraAt(recipe, frame));
      const actor = avatarPoseAt(recipe, frame);
      if (frame) {
        expect(position.y).toBeLessThan(previous.y);
        expect(position.distanceTo(previous)).toBeLessThan(0.32);
        expect(actor.y).toBeLessThanOrEqual(previousFoot);
        expect(previousFoot - actor.y).toBeLessThan(0.32);
      }
      camera.position.copy(position);
      camera.fov = cameraFovAt(recipe, frame);
      camera.lookAt(...cameraTargetAt(recipe, frame));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const feet = new Vector3(actor.x, actor.y, actor.z).project(camera);
      const head = new Vector3(actor.x, actor.y + 1.8, actor.z).project(camera);
      for (const point of [feet, head]) {
        expect(Math.abs(point.x)).toBeLessThan(0.8);
        expect(Math.abs(point.y)).toBeLessThan(0.8);
        expect(point.z).toBeGreaterThan(-1);
        expect(point.z).toBeLessThan(1);
      }
      expect(head.y - feet.y).toBeGreaterThan(0.2);
      for (const prop of evaluateScene(recipe, frame).objects) {
        expect(
          contains(prop, position, 0.06),
          `${frame}/${prop.id} camera obstruction`,
        ).toBe(false);
        for (const height of [0.35, 0.9, 1.55])
          expect(
            contains(
              prop,
              new Vector3(actor.x, actor.y + height, actor.z),
              0.25,
            ),
            `${frame}/${prop.id} mannequin obstruction`,
          ).toBe(false);
      }
      previous = position;
      previousFoot = actor.y;
    }
    expect(avatarPoseAt(recipe, 384).y).toBe(0);
  });

  it("selects the same connected enclosures encountered by the camera", () => {
    const recipe = createStoryPreset("endless-descent");
    const expected = [
      [0, "descent-street", "dry"],
      [192, "descent-street", "dry"],
      [193, "descent-cathedral", "room"],
      [288, "descent-cathedral", "room"],
      [289, "descent-club", "room"],
      [336, "descent-club", "room"],
      [337, "descent-studio", "room"],
      [384, "descent-studio", "room"],
    ] as const;
    for (const [frame, id, kind] of expected) {
      const environment = evaluateAcousticEnvironment(recipe, frame);
      expect(environment.kind).toBe(kind);
      expect(environment.zone.id).toBe(id);
      if (kind === "room")
        expect(environment.zone.approximation).toBe("open-shaft-proxy");
    }
    expect(
      recipe.motion!.acousticZones!.map((zone) => zone.dimensions),
    ).toEqual([
      [64, 100, 64],
      [24, 28, 36],
      [16, 8, 20],
      [8, 4, 10],
    ]);
  });

  it("returns the shorter street camera and authored geometry to their start at the loop seam", () => {
    const recipe = createStoryPreset("bass-avenue");
    expect(recipe.seconds).toBe(8);
    expect(recipe.loop).toBe(true);
    expect(cameraAt(recipe, recipe.frames - 1)).toEqual(cameraAt(recipe, 0));
    expect(cameraTargetAt(recipe, recipe.frames - 1)).toEqual(
      cameraTargetAt(recipe, 0),
    );
    expect(evaluateScene(recipe, recipe.frames - 1).objects).toEqual(
      evaluateScene(recipe, 0).objects,
    );
    expect(evaluateScene(recipe, recipe.frames).objects).toEqual(
      evaluateScene(recipe, 0).objects,
    );
    expect(evaluateAcousticEnvironment(recipe, 96).kind).toBe("dry");
  });
});
