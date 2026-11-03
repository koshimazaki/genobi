import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import { createStudy } from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import {
  FRUIT_COLOURS,
  MIN_CUE_GAP,
} from "../scripts/experiments/recipes-fruit";
import {
  BURST_FRAMES,
  inMechaView,
  MECHA_GLOW,
  MECHA_MORPH_GLOW,
} from "../scripts/experiments/recipes-fruit-mecha";

const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: (i: number) => number, rest = 0.3) => {
  const flat = Array.from({ length: frames }, () => rest);
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
const peaks = new Map([
  [20, 0.9],
  [30, 1],
  [70, 0.95],
  [100, 0.7],
  [150, 0.8],
  [160, 0.85],
]);
const peaky = (frames: number) => bands(frames, (i) => peaks.get(i) ?? 0.1);
/** Left and right voxel ids: 48 each in fruit-mecha, 96 each in the morph. */
const sideOf = (study: string) => (id: string) =>
  Number(id.slice(6)) < (study === "fruit-mecha" ? 48 : 96) ? "left" : "right";
const side = sideOf("fruit-mecha");
/** The dancer's torso and bent arms at shoulder height, either side of x 0. */
const FIGURE_HALF_WIDTH = 0.4;
const STUDIES = ["fruit-mecha", "fruit-mecha-morph"] as const;
const centreOf = (parts: { x: number; y: number }[]) => [
  parts.reduce((t, p) => t + p.x, 0) / parts.length,
  parts.reduce((t, p) => t + p.y, 0) / parts.length,
];

describe("fruit-mecha", () => {
  it.each([97, 193, 241])(
    "builds within the recipe bound with margin at %i frames",
    (frames) => {
      for (const study of STUDIES) {
        const { recipe } = createStudy(study, peaky(frames), dims(frames));
        expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(62_000);
      }
      const { recipe, metadata } = createStudy(
        "fruit-mecha",
        peaky(frames),
        dims(frames),
      );
      expect(metadata.sourcePreset).toBe("fruit-morph");
      expect(recipe.motion!.instances!.count).toBe(96);
    },
  );

  it("opens on a banana on the left and an apple on the right, in colour", () => {
    const { recipe } = createStudy("fruit-mecha", peaky(193), dims(193));
    const first = recipe.motion!.stateKeys[0];
    expect(first.label).toBe("Banana | Apple");
    expect(first.frame).toBe(0);
    const ids = Object.keys(first.objects);
    expect(ids).toHaveLength(96);
    for (const [id, part] of Object.entries(first.objects)) {
      expect(Math.sign(part.x)).toBe(side(id) === "left" ? -1 : 1);
      expect(part.color).toBe(
        side(id) === "left" ? FRUIT_COLOURS.Banana : FRUIT_COLOURS.Apple,
      );
    }
  });

  it.each([97, 193, 241])(
    "bursts and reassembles as two new fruits on every cue at %i frames",
    (frames) => {
      const { recipe, metadata } = createStudy(
        "fruit-mecha",
        peaky(frames),
        dims(frames),
      );
      // Two peaks 2 s apart fit 193 and 241 frames; 97 frames hold one.
      expect(metadata.cues.length).toBe(frames > 97 ? 2 : 1);
      for (let i = 1; i < metadata.cues.length; i++)
        expect(
          metadata.cues[i].frame - metadata.cues[i - 1].frame,
        ).toBeGreaterThanOrEqual(MIN_CUE_GAP);
      const keys = recipe.motion!.stateKeys;
      expect(keys).toHaveLength(1 + 3 * metadata.cues.length);
      const order = ["Banana", "Papaya", "Apple"];
      metadata.cues.forEach((cue, i) => {
        const [hold, burstKey, arrive] = keys.slice(1 + i * 3, 4 + i * 3);
        const peak = cue.frame + BURST_FRAMES;
        expect([hold.frame, burstKey.frame, arrive.frame]).toEqual([
          peak - BURST_FRAMES,
          peak,
          peak + BURST_FRAMES,
        ]);
        expect(cue.target).toBe(arrive.label);
        const [l, r] = arrive.label.split(" | ");
        expect(l).toBe(order[(i + 1) % 3]);
        expect(r).toBe(order[(i + 3) % 3]);
        // At the peak every voxel is far out from its fruit's centre.
        for (const s of ["left", "right"]) {
          const held = Object.entries(hold.objects)
            .filter(([id]) => side(id) === s)
            .map(([, p]) => p);
          const [cx, cy] = centreOf(held);
          const radius = Math.max(
            ...held.map((p) => Math.hypot(p.x - cx, p.y - cy)),
          );
          const out = Object.entries(burstKey.objects)
            .filter(([id]) => side(id) === s)
            .map(([, p]) => Math.hypot(p.x - cx, p.y - cy));
          const mean = out.reduce((t, v) => t + v, 0) / out.length;
          expect(mean).toBeGreaterThan(radius * 2.2);
          // Every flown voxel stays in the view and clear of the dancer.
          for (const [id, p] of Object.entries(burstKey.objects))
            if (side(id) === s) expect(inMechaView(p.x, p.y, p.z)).toBe(true);
          // The burst keeps the outgoing colour.
          const before = Object.entries(hold.objects).find(
            ([id]) => side(id) === s,
          )![1].color;
          for (const [id, p] of Object.entries(burstKey.objects))
            if (side(id) === s) expect(p.color).toBe(before);
        }
        // Eight frames after the peak the scene is the next pair exactly.
        const scene = evaluateScene(
          { ...recipe, motion: { ...recipe.motion!, mappings: [] } },
          peak + BURST_FRAMES,
        ).objects.filter((o) => o.id.startsWith("voxel-"));
        for (const o of scene) {
          expect(o.x).toBeCloseTo(arrive.objects[o.id].x, 6);
          expect(o.y).toBeCloseTo(arrive.objects[o.id].y, 6);
          expect(o.color).toBe(arrive.objects[o.id].color);
        }
      });
    },
  );

  it("fruit-mecha-morph blends banana | apple into papaya | banana on the bass", () => {
    const at = (low: number) => {
      const { recipe } = createStudy(
        "fruit-mecha-morph",
        bands(97, () => low),
        dims(97),
      );
      const scene = evaluateScene(
        { ...recipe, motion: { ...recipe.motion!, mappings: [] } },
        40,
      ).objects.filter((o) => o.id.startsWith("voxel-"));
      return { recipe, scene };
    };
    const quiet = at(0),
      loud = at(1);
    const [rest, peak] = quiet.recipe.motion!.stateKeys;
    expect([rest.label, peak.label]).toEqual([
      "Banana | Apple",
      "Papaya | Banana",
    ]);
    expect(quiet.recipe.motion!.stateKeys).toHaveLength(2);
    for (const o of quiet.scene) {
      expect(o.x).toBeCloseTo(rest.objects[o.id].x, 2);
      expect(o.color).toBe(rest.objects[o.id].color);
    }
    for (const o of loud.scene) {
      expect(o.x).toBeCloseTo(peak.objects[o.id].x, 2);
      expect(o.color).toBe(peak.objects[o.id].color);
    }
    expect(Object.keys(rest.objects)).toHaveLength(192);
  });

  it.each(STUDIES)(
    "%s holds a level front view with the dancer filling most of the frame",
    (study) => {
      const { recipe } = createStudy(study, peaky(97), dims(97));
      expect(recipe.motion!.rotation).toBeUndefined();
      expect(recipe.motion!.mappings.map((m) => m.property)).toEqual(["scale"]);
      expect(recipe.avatarMotion).toBe("dance");
      expect(recipe.avatarPose).toEqual({ x: 0, y: 0, z: 0, yaw: 0 });
      const cam = sceneCameraAt(recipe, 0)!;
      for (const frame of [17, 48, 96])
        expect(sceneCameraAt(recipe, frame)).toEqual(cam);
      expect(cam.position[0]).toBe(0);
      expect(cam.position[1]).toBeGreaterThanOrEqual(1);
      expect(cam.position[1]).toBeLessThanOrEqual(1.2);
      const distance = Math.hypot(
        ...cam.position.map((v, i) => v - cam.target[i]),
      );
      const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
      const share = 1.8 / frame;
      expect(share).toBeGreaterThan(0.75);
      expect(share).toBeLessThan(0.95);
      // Feet just inside the bottom edge.
      const bottom = cam.target[1] - frame / 2;
      expect(bottom).toBeLessThan(0);
      expect(bottom).toBeGreaterThan(-0.2);
    },
  );

  it.each(STUDIES)(
    "%s keeps both fruits clear of the dancer and inside the frame at full bass",
    (study) => {
      const side = sideOf(study);
      for (const level of [0, 1]) {
        const { recipe } = createStudy(
          study,
          bands(97, () => level),
          dims(97),
        );
        const cam = sceneCameraAt(recipe, 0)!;
        const distance = Math.hypot(
          ...cam.position.map((v, i) => v - cam.target[i]),
        );
        const halfWidth =
          distance * Math.tan((cam.fov / 2) * (Math.PI / 180)) * (1024 / 576);
        const parts = evaluateScene(recipe, 40).objects;
        for (const s of ["left", "right"]) {
          const fruit = parts.filter((p) => side(p.id) === s);
          const half = (p: (typeof fruit)[number]) =>
            (p.scale * (p.scaleX ?? 1)) / 2;
          const inner = Math.min(...fruit.map((p) => Math.abs(p.x) - half(p)));
          const outer = Math.max(...fruit.map((p) => Math.abs(p.x) + half(p)));
          // 0.15 m: the owner accepts an arm brushing a fruit as dance.
          expect(inner - FIGURE_HALF_WIDTH).toBeGreaterThan(0.15);
          expect(outer).toBeLessThan(halfWidth);
          const xs = fruit.map((p) => p.x);
          const across = Math.max(...xs) - Math.min(...xs);
          // An upright banana is narrower across than it is tall.
          expect(across).toBeGreaterThan(0.2);
        }
      }
    },
  );

  it.each([
    ["fruit-mecha", MECHA_GLOW],
    ["fruit-mecha-morph", MECHA_MORPH_GLOW],
  ] as const)(
    "%s glows the fruit on the bass through the primitives route",
    (study, glow) => {
      const { recipe } = createStudy(study, peaky(97), dims(97));
      expect(recipe.audioRoutes).toEqual([
        expect.objectContaining({
          source: "low",
          target: "primitives",
          property: "glow",
          amount: glow,
          enabled: true,
        }),
      ]);
      expect(
        evaluateScene(recipe, 30).mods.get("primitives")?.glow,
      ).toBeCloseTo(glow, 3);
    },
  );
});

describe("mecha framing", () => {
  it.each(STUDIES)(
    "%s keeps the fruit centres within about 1.1 m at full bass",
    (study) => {
      const side = sideOf(study);
      const { recipe } = createStudy(
        study,
        bands(97, () => 1),
        dims(97),
      );
      for (const frame of [0, 40, 96]) {
        const parts = evaluateScene(recipe, frame).objects.filter((o) =>
          o.id.startsWith("voxel-"),
        );
        for (const s of ["left", "right"]) {
          const fruit = parts.filter((p) => side(p.id) === s);
          const centre =
            fruit.reduce((t, p) => t + Math.abs(p.x), 0) / fruit.length;
          expect(centre).toBeLessThan(1.15);
        }
      }
    },
  );

  it.each(STUDIES)(
    "%s keeps every fruit voxel inside the camera frustum at full bass",
    (study) => {
      const { recipe } = createStudy(study, peaky(193), dims(193));
      // Full bass throughout, the cue keys kept: every frame is the loudest.
      const loud = {
        ...recipe,
        bandEnvelopes: {
          ...recipe.bandEnvelopes,
          low: recipe.bandEnvelopes.low.map(() => 1),
        },
      };
      const pose = sceneCameraAt(loud, 0)!;
      const camera = new PerspectiveCamera(pose.fov, 1024 / 576, 0.1, 100);
      camera.position.set(...pose.position);
      camera.lookAt(new Vector3(...pose.target));
      camera.updateMatrixWorld();
      const size = recipe.motion!.instances!.size;
      for (let frame = 0; frame < 193; frame += 4)
        for (const o of evaluateScene(loud, frame).objects) {
          if (!o.id.startsWith("voxel-")) continue;
          const half = (o.scale * size) / 2;
          for (const corner of [-1, 1]) {
            const p = new Vector3(
              o.x + corner * half,
              o.y + corner * half,
              o.z,
            ).project(camera);
            expect(Math.abs(p.x)).toBeLessThan(1);
            expect(Math.abs(p.y)).toBeLessThan(1);
          }
        }
    },
  );
});
