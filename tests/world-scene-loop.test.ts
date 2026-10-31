import { describe, expect, it } from "vitest";
import {
  defaultRecipe,
  validateRecipe,
  cameraAt,
  type Recipe,
  type Prop,
} from "../src/world-builder/recipe";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { scaledAxes } from "../src/world-builder/scene-contract";
import { projectSceneGeometry } from "../src/world-builder/scene-projection";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { createRoute } from "../src/world-builder/mod-routes";
import { defaultCharacterAudio } from "../src/world-builder/character-audio";
import { captureSceneState } from "../src/world-builder/scene-state-snapshot";
import { patchSceneObject } from "../src/world-builder/scene-editing";
import {
  resampleMorphParts,
  partBounds,
} from "../src/world-builder/morph-resample";
import {
  createSceneLoopBank,
  saveSceneLoopSlot,
  removeSceneLoopSlot,
  sceneLoopSlotRecipe,
  composeSceneLoop,
  validateSceneLoopBank,
  type SceneLoopBank,
  type SceneLoopSlot,
} from "../src/world-builder/scene-loop";

function scene(
  id = "subject",
  shape: Prop["shape"] = "box",
  color = "#ff0000",
  x = 0,
): Recipe {
  return validateRecipe({
    ...structuredClone(defaultRecipe),
    audioRoutes: [],
    screen: false,
    orbit: 0,
    objects: [
      { id, shape, color, x, y: 1, z: 0, scale: 1, spin: 0, prompt: "" },
    ],
  });
}
function bankOf(...recipes: Recipe[]): SceneLoopBank {
  return recipes.reduce(
    (bank, recipe, index) =>
      saveSceneLoopSlot(bank, index as SceneLoopSlot, recipe, 0),
    createSceneLoopBank(),
  );
}
const visible = (recipe: Recipe, frame: number) =>
  evaluateScene(recipe, frame).objects.filter(
    (part) => (part.presence ?? 1) > 0,
  );

describe("independent scene-loop slots", () => {
  it("keeps A through loading another asset and saving B, without mutating source scenes or storing audio", () => {
    const a = scene(),
      b = scene("ring", "torus", "#00ff00", 3);
    a.envelope = [0.4, 0.8];
    a.bandEnvelopes.low = [0.3];
    const before = JSON.stringify(a);
    const empty = createSceneLoopBank();
    const first = saveSceneLoopSlot(empty, 0, a, 0, { label: "Cube" });
    const second = saveSceneLoopSlot(first, 1, b, 0, { label: "Ring" });
    expect(empty.slots.every((slot) => slot === null)).toBe(true);
    expect(first.slots[1]).toBeNull();
    expect(second.slots[0]).toEqual(first.slots[0]);
    expect(JSON.stringify(a)).toBe(before);
    expect(second.slots[0]!.recipe.envelope).toEqual([]);
    expect(second.slots[0]!.recipe.bandEnvelopes.low).toEqual([]);
    const restored = validateSceneLoopBank(JSON.parse(JSON.stringify(second)));
    restored.slots[0]!.recipe.objects[0].x = 20;
    expect(second.slots[0]!.recipe.objects[0].x).toBe(0);
    const recalled = sceneLoopSlotRecipe(second, 0, b);
    expect(visible(recalled, 0)[0].shape).toBe("box");
    expect(removeSceneLoopSlot(second, 0).slots[1]).toEqual(second.slots[1]);
  });

  it("captures exact current camera and baked authored movement once, while audio stays dynamic", () => {
    const source = createMotionPreset("city-to-loft");
    source.motion!.rotation = { axis: "y", turns: 0.5 };
    source.envelope = Array(source.frames).fill(1);
    const frame = 48;
    const camera = {
      position: [70, 12, 40] as [number, number, number],
      target: [1, 3, -2] as [number, number, number],
      fov: 52,
    };
    const bank = saveSceneLoopSlot(createSceneLoopBank(), 0, source, frame, {
      camera,
    });
    const saved = sceneLoopSlotRecipe(bank, 0);
    expect(cameraAt(saved, 0)).toEqual(camera.position);
    expect(saved.cameraMotion!.keys[0].target).toEqual(camera.target);
    expect(saved.cameraMotion!.keys[0].fov).toBe(52);
    expect(saved.motion!.rotation).toBeUndefined();
    const expected = evaluateScene(source, frame, { audio: false }).objects;
    const actual = evaluateScene(saved, 0).objects;
    expect(
      actual.map((part) => [part.id, part.x, part.y, part.z, part.color]),
    ).toEqual(
      expected.map((part) => [part.id, part.x, part.y, part.z, part.color]),
    );
    expect(evaluateScene(saved, 80).objects).toEqual(actual);
  });

  it("rejects unknown/oversized bank data, embedded soundtracks, and disagreeing camera receipts", () => {
    const bank = bankOf(scene());
    expect(() =>
      validateSceneLoopBank({ ...bank, execute: "script" }),
    ).toThrow();
    expect(() =>
      validateSceneLoopBank({ ...bank, slots: [...bank.slots, null] }),
    ).toThrow();
    const audio = structuredClone(bank);
    audio.slots[0]!.recipe.envelope = [1];
    expect(() => validateSceneLoopBank(audio)).toThrow(/soundtrack/);
    const camera = structuredClone(bank);
    camera.slots[0]!.camera.fov = 80;
    expect(() => validateSceneLoopBank(camera)).toThrow(/camera/);
    expect(() =>
      saveSceneLoopSlot(bank, 4 as SceneLoopSlot, scene(), 0),
    ).toThrow(/A, B, C or D/);
    expect(() => saveSceneLoopSlot(bank, 0, scene(), Infinity)).toThrow(
      /frame/,
    );
  });
});

describe("global loop composition", () => {
  it("interpolates a retained primitive's geometry and exact endpoint colors, then returns to A inside8seconds", () => {
    const bank = bankOf(scene(), scene("subject", "box", "#0000ff", 4));
    const recipe = composeSceneLoop(bank);
    expect(recipe.frames).toBe(193);
    expect(recipe.motion!.stateKeys.map((key) => key.frame)).toEqual([
      0, 96, 192,
    ]);
    expect(
      recipe.motion!.stateAudio!.routes.map((route) => route.stateId),
    ).toEqual(["loop-A", "loop-B"]);
    expect(visible(recipe, 0)[0].color).toBe("#ff0000");
    expect(visible(recipe, 96)[0].color).toBe("#0000ff");
    expect(visible(recipe, 48)[0].color).toBe("#800080");
    expect(visible(recipe, 96)[0].x).toBe(4);
    expect(evaluateScene(recipe, 192).objects).toEqual(
      evaluateScene(recipe, 0).objects,
    );
    expect(evaluateScene(recipe, recipe.frames).objects).toEqual(
      evaluateScene(recipe, 0).objects,
    );
    const once = composeSceneLoop(bank, { returnToStart: false });
    expect(once.motion!.stateKeys.map((key) => key.frame)).toEqual([0, 192]);
    expect(once.loop).toBe(false);
  });

  it.each(["direct", "scatter", "twist", "assemble"] as const)(
    "rebuilds unlike primitives with actual zero visibility and deterministic %s paths",
    (style) => {
      const recipe = composeSceneLoop(
        bankOf(scene(), scene("subject", "sphere", "#00ff00", 3)),
        { style },
      );
      expect(recipe.objects).toHaveLength(2);
      expect(new Set(recipe.objects.map((part) => part.id)).size).toBe(2);
      expect(visible(recipe, 0).map((part) => part.shape)).toEqual(["box"]);
      expect(visible(recipe, 96).map((part) => part.shape)).toEqual(["sphere"]);
      const hidden = evaluateScene(recipe, 0).objects.find(
        (part) => part.presence === 0,
      )!;
      expect(scaledAxes(hidden)).toEqual([0, 0, 0]);
      expect(
        projectSceneGeometry(recipe, 0, 640, 352).every(
          (face) => face.color === "#ff0000",
        ),
      ).toBe(true);
      const middle = evaluateScene(recipe, 41.5).objects;
      evaluateScene(recipe, 150);
      evaluateScene(recipe, 5);
      expect(evaluateScene(recipe, 41.5).objects).toEqual(middle);
      expect(
        middle.every(
          (part) => (part.presence ?? 1) >= 0 && (part.presence ?? 1) <= 1,
        ),
      ).toBe(true);
    },
  );

  it("keeps four main destinations and a separate return endpoint, with gaps left independent", () => {
    const bank = bankOf(scene(), scene("b"), scene("c"), scene("d"));
    const recipe = composeSceneLoop(bank);
    expect(recipe.motion!.stateKeys.map((key) => key.id)).toEqual([
      "loop-A",
      "loop-B",
      "loop-C",
      "loop-D",
      "loop-return-A",
    ]);
    expect(recipe.motion!.stateAudio!.routes).toHaveLength(4);
    expect(
      composeSceneLoop(removeSceneLoopSlot(bank, 1)).motion!.stateKeys.map(
        (key) => key.id,
      ),
    ).toEqual(["loop-A", "loop-C", "loop-D", "loop-return-A"]);
    const old = createMotionPreset("fruit-audio-branches");
    expect(old.motion!.stateKeys).toHaveLength(5);
    saveSceneLoopSlot(
      createSceneLoopBank(),
      0,
      old,
      old.motion!.stateKeys[4].frame,
    );
    expect(old.motion!.stateKeys).toHaveLength(5);
  });

  it("matches differing voxel counts while preserving target colors and mixed primitive/voxel slots", () => {
    const a = createMotionPreset("voxel-architecture"),
      b = createMotionPreset("fruit-morph");
    const recipe = composeSceneLoop(bankOf(a, b));
    expect(recipe.motion!.instances!.count).toBe(96);
    const colors = (value: Recipe, frame: number) =>
      new Set(visible(value, frame).map((part) => part.color));
    expect(colors(recipe, 0)).toEqual(colors(a, 0));
    expect(colors(recipe, 96)).toEqual(colors(b, 0));
    const mixed = composeSceneLoop(bankOf(scene("cube"), a));
    expect(visible(mixed, 0).map((part) => part.id)).toEqual(["cube"]);
    expect(visible(mixed, 96)).toHaveLength(64);
  });

  it("splits a partially present block without applying its shrink factor twice", () => {
    const source = {
      x: 1,
      y: 2,
      z: 3,
      scale: 2,
      presence: 0.5,
      color: "#abcdef",
    };
    const expected = partBounds(source);
    const split = resampleMorphParts([source], 2);
    const first = partBounds(split[0]),
      second = partBounds(split[1]);
    expect(first.min.min(second.min).toArray()).toEqual(expected.min.toArray());
    expect(first.max.max(second.max).toArray()).toEqual(expected.max.toArray());
    expect(split.every((part) => part.color === source.color)).toBe(true);
  });

  it("keeps valid special primitive IDs as own data properties", () => {
    const recipe = composeSceneLoop(
      bankOf(scene("__proto__"), scene("__proto__", "box", "#0000ff", 2)),
    );
    expect(
      Object.hasOwn(recipe.motion!.stateKeys[0].objects, "__proto__"),
    ).toBe(true);
    expect(visible(recipe, 96)[0].x).toBe(2);
  });

  it("preserves paired camera views unless a whole-loop override is explicitly supplied", () => {
    let bank = createSceneLoopBank();
    const cameras = [
      { position: [8, 3, 12], target: [0, 1, 0], fov: 40 },
      { position: [-4, 9, 13], target: [3, 2, 0], fov: 62 },
    ] as const;
    cameras.forEach((camera, index) => {
      bank = saveSceneLoopSlot(bank, index as SceneLoopSlot, scene(), 0, {
        camera: {
          position: [...camera.position],
          target: [...camera.target],
          fov: camera.fov,
        },
      });
    });
    const paired = composeSceneLoop(bank);
    expect(cameraAt(paired, 96)).toEqual(cameras[1].position);
    const current = createMotionPreset("city-to-loft");
    const override = composeSceneLoop(bank, {
      camera: current,
      cameraOrbit: { axis: "y", turns: 1 },
      cameraAudio: {
        enabled: true,
        source: "sub",
        amount: 0.3,
        motion: "push",
      },
    });
    expect(override.cameraMotion!.keys.map((key) => key.frame)).toEqual([
      0, 96, 192,
    ]);
    expect(override.cameraMotion!.keys[1].position).toEqual(
      current.cameraMotion!.keys[1].position,
    );
    expect(override.cameraMotion!.orbit).toEqual({ axis: "y", turns: 1 });
    expect(override.cameraMotion!.audio.enabled).toBe(true);
  });

  it("uses active soundtrack/character routes without putting them in the bank or reassigning changed props", () => {
    const a = scene(),
      b = scene("subject", "sphere", "#00ff00");
    a.avatar = b.avatar = true;
    const bank = bankOf(a, b),
      before = JSON.stringify(bank);
    const characterAudio = {
      ...defaultCharacterAudio("mannequin"),
      enabled: true,
    };
    const recipe = composeSceneLoop(bank, {
      audio: {
        envelope: [0, 1],
        bandEnvelopes: { sub: [1], low: [], mid: [], high: [] },
      },
      characterAudio,
      audioRoutes: [
        createRoute({ id: "whole", target: "primitives" }),
        createRoute({ id: "changed", target: "prop:subject" }),
      ],
    });
    expect(recipe.envelope).toEqual([0, 1]);
    expect(recipe.characterAudio).toEqual(characterAudio);
    expect(recipe.audioRoutes.map((route) => route.id)).toEqual(["whole"]);
    expect(JSON.stringify(bank)).toBe(before);
  });

  it("retains long-take audio headroom and refuses dense combinations without changing saved slots", () => {
    const small = composeSceneLoop(bankOf(scene(), scene("b")), {
      durationSeconds: 30,
    });
    expect(small.frames).toBe(721);
    const signal = Array(721).fill(0.1234);
    expect(() =>
      validateRecipe({
        ...small,
        envelope: signal,
        bandEnvelopes: { sub: signal, low: signal, mid: signal, high: signal },
      }),
    ).not.toThrow();
    const dense = createMotionPreset("voxel-architecture-256");
    const bank = bankOf(dense, dense, dense, dense),
      before = JSON.stringify(bank);
    expect(() => composeSceneLoop(bank)).toThrow(/fewer blocks|fewer states/);
    expect(JSON.stringify(bank)).toBe(before);
  });
});

describe("loop contract validation and compatibility", () => {
  it.each([-1, 2, "0", NaN])("rejects invalid presence %s", (presence) => {
    const recipe = composeSceneLoop(bankOf(scene(), scene("b")));
    recipe.motion!.stateKeys[0].objects.subject.presence = presence as number;
    expect(() => validateRecipe(recipe)).toThrow();
  });
  it("validates animated colors in every key and preserves them during scene edits/saves", () => {
    const recipe = composeSceneLoop(
      bankOf(scene(), scene("subject", "box", "#0000ff")),
    );
    const edit = patchSceneObject(recipe, 0, "subject", { x: 2 });
    const edited = validateRecipe({ ...recipe, ...edit });
    expect(edited.motion!.stateKeys[0].objects.subject.color).toBe("#ff0000");
    expect(
      captureSceneState(edited, 0, { targetStateId: "loop-A" }).motion!
        .stateKeys[0].objects.subject.color,
    ).toBe("#ff0000");
    delete edited.motion!.stateKeys[1].objects.subject.color;
    expect(() => validateRecipe(edited)).toThrow(/every state/);
    recipe.motion!.stateKeys[0].objects.subject.color = [
      "#ff0000",
    ] as unknown as string;
    expect(() => validateRecipe(recipe)).toThrow();
  });
  it("refuses incompatible generated shells, characters and external texture attachments clearly", () => {
    expect(() => composeSceneLoop(bankOf(scene()))).toThrow(/at least two/);
    const shader = scene();
    shader.scene = "neuro";
    expect(() => bankOf(shader)).toThrow(/shader scene/);
    const playground = scene();
    playground.scene = "playground";
    expect(() => composeSceneLoop(bankOf(scene(), playground))).toThrow(
      /same Stage or Playground/,
    );
    const avatar = scene();
    avatar.avatar = true;
    expect(() => composeSceneLoop(bankOf(scene(), avatar))).toThrow(
      /character model/,
    );
    const textured = scene();
    textured.textures = {
      "prop:subject/all": { name: "local.png", type: "image" },
    };
    const bank = bankOf(scene(), textured);
    expect(() => composeSceneLoop(bank)).toThrow(/untextured geometry/);
    expect(sceneLoopSlotRecipe(bank, 1).textures).toEqual(textured.textures);
  });
});
