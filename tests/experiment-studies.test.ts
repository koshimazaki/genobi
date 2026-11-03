import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import { evaluateScene } from "../src/world-builder/evaluate-scene";
import { sceneCameraAt } from "../src/world-builder/scene-camera";
import {
  STUDIES,
  createStudy,
  peakCues,
  type Study,
} from "../scripts/experiments/recipes";
import { serializeRecipe } from "../scripts/experiments/contracts";
import { MIN_CUE_GAP } from "../scripts/experiments/recipes-fruit";
import { OUTPUT_NAME } from "../scripts/experiments/studies.mjs";
import {
  keyframeFile,
  pickKeyframes,
  snapToGrid,
} from "../scripts/experiments/keyframe-pick.mjs";

const NEW: Study[] = [
  "cathedral-walls",
  "canyon",
  "fruit-dance",
  "fruit-mecha",
  "room-walls",
  "pyramid-inside",
  "fruit-apple",
  "fruit-banana",
  "fruit-papaya",
];
const dims = (frames: number) => ({ width: 1024, height: 576, frames });
const bands = (frames: number, low: (i: number) => number, rest = 0.3) => {
  const flat = Array.from({ length: frames }, () => rest);
  const lowData = Array.from({ length: frames }, (_, i) => low(i));
  return {
    envelope: [...flat],
    bandEnvelopes: {
      sub: [...flat],
      low: lowData,
      mid: [...flat],
      high: [...flat],
    },
  };
};
describe("new pilot studies", () => {
  it.each([97, 193, 241])(
    "all build and fit the native recipe bound at %i frames",
    (frames) => {
      for (const study of NEW) {
        const { recipe, metadata } = createStudy(
          study,
          bands(frames, (i) => 0.1 + ((i * 13) % 89) / 100),
          dims(frames),
        );
        expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
        expect(metadata.study).toBe(study);
        expect(metadata.design).toBeTruthy();
      }
    },
  );

  it("allows every study id, and only those, as a capture output name", () => {
    for (const study of STUDIES)
      expect(OUTPUT_NAME.test(`${study}/rgb.webm`)).toBe(true);
    expect(OUTPUT_NAME.test("../x/rgb.webm")).toBe(false);
    expect(OUTPUT_NAME.test("canyon/../../x.json")).toBe(false);
    expect(OUTPUT_NAME.test("canyon/rgb.mp4")).toBe(false);
  });

  const layout = (study: Study, low: number, frame: number) => {
    const { recipe } = createStudy(
      study,
      bands(97, () => low),
      dims(97),
    );
    const scene = evaluateScene(recipe, frame);
    return {
      parts: scene.objects.filter((o) => o.id.startsWith("voxel-")),
      room: scene.room!.dimensions,
    };
  };

  it.each([
    ["canyon", ["z"], 0.55],
    ["pyramid-inside", ["x", "z"], 0.7],
  ] as [Study, ("x" | "z")[], number][])(
    "%s closes sideways only on the bass, whatever the frame",
    (study, axes, fraction) => {
      const quiet = layout(study, 0, 30),
        loud = layout(study, 1, 30);
      expect(loud.parts.length).toBe(quiet.parts.length);
      quiet.parts.forEach((q, i) => {
        const l = loud.parts[i];
        // Loud = closer to the centre; height (and any other axis) holds.
        for (const axis of ["x", "z"] as const)
          expect(l[axis]).toBeCloseTo(
            axes.includes(axis) ? q[axis] * fraction : q[axis],
            // Stored positions are rounded to millimetres.
            2,
          );
        expect(l.y).toBeCloseTo(q.y, 6);
      });
      // The reverb box shrinks with the walls.
      expect(loud.room[0]).toBeLessThan(quiet.room[0]);
      expect(loud.room[2]).toBeLessThan(quiet.room[2]);
      // The clock never moves the walls: same band, different frame, same layout.
      expect(layout(study, 0, 80).parts).toEqual(quiet.parts);
      expect(layout(study, 1, 80).parts).toEqual(loud.parts);
    },
  );

  it("cathedral-walls narrows the whole nave in x while the vault ridge holds", () => {
    const quiet = layout("cathedral-walls", 0, 30),
      loud = layout("cathedral-walls", 1, 30);
    expect(quiet.parts.length).toBeGreaterThan(140);
    const mean = (parts: typeof quiet.parts) =>
      parts.reduce((sum, o) => sum + Math.abs(o.x), 0) / parts.length;
    expect(mean(loud.parts)).toBeLessThan(mean(quiet.parts) * 0.65);
    quiet.parts.forEach((q, i) => {
      const l = loud.parts[i];
      expect(l.z).toBeCloseTo(q.z, 6);
      expect(Math.abs(l.x)).toBeLessThanOrEqual(Math.abs(q.x) + 1e-6);
    });
    // The ridge rib (x 0, y 21) does not move at all.
    const ridge = quiet.parts.filter((o) => o.x === 0 && o.y === 21);
    expect(ridge).toHaveLength(6);
    for (const r of ridge)
      expect(loud.parts.find((o) => o.id === r.id)).toMatchObject({
        x: 0,
        y: 21,
      });
    expect(loud.room[0]).toBeLessThan(quiet.room[0]);
    expect(layout("cathedral-walls", 1, 80).parts).toEqual(loud.parts);
  });

  it.each([
    "cathedral-walls",
    "canyon",
    "room-walls",
    "fruit-dance",
    "fruit-mecha",
    "fruit-apple",
  ] as Study[])(
    "%s holds the camera still whatever the music does",
    (study) => {
      const { recipe } = createStudy(
        study,
        bands(97, (i) => (i % 9) / 8),
        dims(97),
      );
      const first = sceneCameraAt(recipe, 0)!;
      for (const frame of [17, 48, 96])
        expect(sceneCameraAt(recipe, frame)).toEqual(first);
    },
  );

  it("room-walls shows its room box, closes it on the bass and casts a dancer inside", () => {
    const { recipe } = createStudy(
      "room-walls",
      bands(97, () => 0),
      dims(97),
    );
    expect(recipe.motion!.room!.visible).toBe(true);
    // Empty: every apartment piece is hidden.
    for (const part of Object.values(recipe.motion!.stateKeys[0].objects))
      expect(part.presence).toBe(0);
    expect(recipe.motion!.room!.dimensions[0]).toBeLessThan(5);
    expect(recipe.avatar).toBe(true);
    expect(recipe.avatarMotion).toBe("dance");
    const quiet = evaluateScene(recipe, 40).room!.dimensions;
    const { recipe: loudRecipe } = createStudy(
      "room-walls",
      bands(97, () => 1),
      dims(97),
    );
    const loud = evaluateScene(loudRecipe, 40).room!.dimensions;
    expect(loud[0]).toBeLessThan(quiet[0]);
    expect(loud[2]).toBeLessThan(quiet[2]);
    // Camera and dancer stay inside the closed box.
    const cam = sceneCameraAt(loudRecipe, 40)!.position;
    expect(Math.abs(cam[0])).toBeLessThan(loud[0] / 2);
    expect(Math.abs(loudRecipe.avatarPose.x)).toBeLessThan(loud[0] / 2);
    expect(Math.abs(loudRecipe.avatarPose.z)).toBeLessThan(loud[2] / 2);
    // At full bass the walls are within 1.5 m of the dancer.
    expect(loud[0] / 2).toBeLessThan(1.5);
  });

  it("fruit-dance changes shape on the strongest bass peaks, at least 2 s apart", () => {
    const peaks = new Map([
      [20, 0.9],
      [30, 1],
      [70, 0.95],
      [150, 0.8],
      [160, 0.85],
    ]);
    const { recipe, metadata } = createStudy(
      "fruit-dance",
      bands(193, (i) => peaks.get(i) ?? 0.1),
      dims(193),
    );
    expect(metadata.cues.map((c) => c.frame)).toEqual([30, 160]);
    expect(metadata.cues.map((c) => c.target)).toEqual(["Banana", "Apple"]);
    expect(recipe.motion!.stateKeys[0].label).toBe("Apple");
    expect(recipe.avatar && recipe.avatarMotion).toBe("dance");
    for (let i = 1; i < metadata.cues.length; i++)
      expect(
        metadata.cues[i].frame - metadata.cues[i - 1].frame,
      ).toBeGreaterThanOrEqual(MIN_CUE_GAP);
  });

  it("peakCues takes the top peaks with a minimum gap, in time order", () => {
    const band = Array.from(
      { length: 193 },
      (_, i) => 0.2 + 0.1 * Math.sin(i / 3),
    );
    band[100] = 1;
    band[120] = 0.99;
    band[10] = 0.98;
    const cues = peakCues(band, 3, 48);
    expect(cues[0].frame).toBe(10);
    expect(cues.map((c) => c.frame)).toContain(100);
    expect(cues.map((c) => c.frame)).not.toContain(120);
    for (let i = 1; i < cues.length; i++)
      expect(cues[i].frame - cues[i - 1].frame).toBeGreaterThanOrEqual(48);
    expect(peakCues(Array(97).fill(0), 3, 48)).toEqual([]);
  });
});

describe("keyframe picking", () => {
  it("finds the loudest and the quietest smoothed frames on a synthetic band", () => {
    const series = Array.from({ length: 97 }, (_, i) =>
      i < 8 ? 0 : 0.5 + 0.4 * Math.sin(((i - 8) / 89) * 2 * Math.PI),
    );
    const [first, closed, open] = pickKeyframes(series);
    expect(first).toMatchObject({ role: "first", index: 0, source: 0 });
    // The sine peaks at a quarter cycle (frame ~30) and dips at three quarters
    // (~75); LTX snaps guides to multiples of 8, so 32 and 72.
    expect(closed.role).toBe("closed");
    expect(Math.abs(closed.source - 30)).toBeLessThanOrEqual(1);
    expect(closed.index).toBe(32);
    expect(open.role).toBe("open");
    expect(Math.abs(open.source - 75)).toBeLessThanOrEqual(1);
    expect(open.index).toBe(72);
    expect(keyframeFile("closed", closed.index)).toMatch(
      /^frame-closed-00\d\d\.png$/,
    );
    expect(keyframeFile("first", 0)).toBe("frame-0000.png");
  });

  it("skips the follower's start-up when looking for the open frame", () => {
    const series = Array(30).fill(0.5);
    series[2] = 0;
    series[20] = 0.1;
    expect(pickKeyframes(series, { window: 1 })[2]).toMatchObject({
      source: 20,
      index: 24,
    });
    expect(() => pickKeyframes([0, 1])).toThrow(/longer than 8/);
  });

  it("snaps to the 8-frame latent grid, never frame 0 or the last frame", () => {
    expect(snapToGrid(3, 97)).toBe(8);
    expect(snapToGrid(0, 97)).toBe(8);
    expect(snapToGrid(36, 97)).toBe(40);
    expect(snapToGrid(96, 97)).toBe(88);
    expect(snapToGrid(95, 97)).toBe(88);
    expect(snapToGrid(192, 193)).toBe(184);
    for (const frames of [97, 193, 241])
      for (let i = 0; i < frames; i++) {
        const n = snapToGrid(i, frames);
        expect(n % 8).toBe(0);
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(frames - 1);
      }
  });
});

describe("diamond study", () => {
  it.each([97, 193, 241])(
    "builds within the recipe bound at %i frames",
    (frames) => {
      const { recipe, metadata } = createStudy(
        "diamond",
        bands(frames, (i) => 0.1 + ((i * 13) % 89) / 100),
        dims(frames),
      );
      expect(serializeRecipe(recipe).bytes).toBeLessThanOrEqual(64_000);
      expect(metadata.design).toBeTruthy();
      expect(
        recipe.motion!.mappings.map((m) => [m.property, m.source, m.amount]),
      ).toEqual([
        ["scale", "low", 0.9],
        ["lift", "sub", 1.5],
        ["twistY", "mid", 0.3],
      ]);
      expect([recipe.radius, recipe.elevation]).toEqual([26, 3]);
      expect(recipe.cameraMotion!.keys[0].target).toEqual([
        0,
        recipe.targetY,
        0,
      ]);
    },
  );

  it("holds one silhouette: identical states and the same shape at every frame", () => {
    const { recipe } = createStudy(
      "diamond",
      bands(97, () => 0.5),
      dims(97),
    );
    const [a, b, c] = recipe.motion!.stateKeys;
    expect(b.objects).toEqual(a.objects);
    expect(c.objects).toEqual(a.objects);
    const shape = (frame: number) =>
      evaluateScene(recipe, frame, { editing: true }).objects;
    expect(shape(60)).toEqual(shape(0));
    expect(shape(96)).toEqual(shape(0));
    // It hovers: the lowest facet clears the floor at rest.
    expect(Math.min(...shape(0).map((o) => o.y))).toBeGreaterThan(2);
  });

  it("swells on the bass about its own centre", () => {
    const size = (low: number) => {
      const { recipe } = createStudy(
        "diamond",
        bands(97, () => low),
        dims(97),
      );
      const parts = evaluateScene(recipe, 40).objects;
      return (
        Math.max(...parts.map((o) => o.y)) - Math.min(...parts.map((o) => o.y))
      );
    };
    // Intensity stays at the preset 0.5, as in pulse: full bass is x1.45.
    expect(size(1)).toBeGreaterThan(size(0) * 1.35);
  });
});

describe("camera clearance at the loudest bar", () => {
  // Every box corner, edge midpoint and face centre, rotated, against the lens.
  const nearest = (study: Study, low: number) => {
    const { recipe } = createStudy(
      study,
      bands(193, () => low),
      dims(193),
    );
    const cam = new Vector3(...sceneCameraAt(recipe, 100)!.position);
    const size = recipe.motion!.instances?.size ?? 1;
    let best = Infinity;
    for (const o of evaluateScene(recipe, 100).objects) {
      const h = [o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1].map(
        (v) => (v * o.scale * size) / 2,
      );
      const turn = new Euler(
        o.rotationX ?? 0,
        o.rotation ?? 0,
        o.rotationZ ?? 0,
      );
      for (let k = 0; k < 27; k++) {
        const p = new Vector3(
          ((k % 3) - 1) * h[0],
          ((Math.floor(k / 3) % 3) - 1) * h[1],
          (Math.floor(k / 9) - 1) * h[2],
        )
          .applyEuler(turn)
          .add(new Vector3(o.x, o.y, o.z));
        best = Math.min(best, p.distanceTo(cam));
      }
    }
    return { best, recipe };
  };

  it("cathedral-walls never brings a piece within 3 m of the loft camera", () => {
    for (const low of [0, 1])
      expect(nearest("cathedral-walls", low).best).toBeGreaterThan(3);
  });

  it("pyramid-inside keeps its walls clear of the lens and the figure inside", () => {
    const { best, recipe } = nearest("pyramid-inside", 1);
    expect(best).toBeGreaterThan(2.5);
    // The base terrace's inner face at full close: 19.2 m x 0.7 less half its 1.5 m wall.
    const inner = 19.2 * 0.7 - 0.75;
    expect(Math.abs(recipe.avatarPose.x)).toBeLessThan(inner);
    expect(Math.abs(recipe.avatarPose.z)).toBeLessThan(inner);
  });
});

describe("single fruit studies", () => {
  it.each([
    ["fruit-apple", "Apple"],
    ["fruit-banana", "Banana"],
    ["fruit-papaya", "Papaya"],
  ] as [Study, string][])(
    "%s holds one %s on the floor, pulses on low, twists a little on mid",
    (study, label) => {
      const { recipe } = createStudy(
        study,
        bands(97, () => 0),
        dims(97),
      );
      const keys = recipe.motion!.stateKeys;
      expect(keys.map((k) => k.label)).toEqual([label, label, label]);
      expect(keys[1].objects).toEqual(keys[0].objects);
      expect(recipe.avatar).toBe(false);
      expect(
        recipe.motion!.mappings.map((m) => [m.property, m.source, m.amount]),
      ).toEqual([
        ["scale", "low", 0.3],
        ["twistY", "mid", 0.2],
      ]);
      // Resting on the floor, about half the frame tall or wide.
      const parts = evaluateScene(recipe, 10).objects;
      const size = recipe.motion!.instances!.size;
      const half = (o: (typeof parts)[number]) => (o.scale * size) / 2;
      const low = Math.min(...parts.map((o) => o.y - half(o)));
      // Millimetre rounding of the stored layout.
      expect(low).toBeGreaterThanOrEqual(-0.005);
      expect(low).toBeLessThan(0.05);
      const cam = sceneCameraAt(recipe, 0)!;
      const distance = Math.hypot(
        ...cam.position.map((v, i) => v - cam.target[i]),
      );
      const frame = 2 * distance * Math.tan((cam.fov / 2) * (Math.PI / 180));
      const height = Math.max(...parts.map((o) => o.y + half(o))) - low;
      const width =
        Math.max(...parts.map((o) => o.x + half(o))) -
        Math.min(...parts.map((o) => o.x - half(o)));
      const share = Math.max(height / frame, width / (frame * (1024 / 576)));
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThan(0.55);
    },
  );

  it("fruit-dance holds a front view with the fruit beside the dancer", () => {
    const { recipe } = createStudy(
      "fruit-dance",
      bands(97, () => 0.2),
      dims(97),
    );
    expect(recipe.motion!.rotation).toBeUndefined();
    const parts = evaluateScene(recipe, 0).objects.filter((o) =>
      o.id.startsWith("voxel-"),
    );
    const nearest = Math.min(...parts.map((o) => Math.hypot(o.x, o.z)));
    expect(nearest).toBeGreaterThan(0.4);
    expect(nearest).toBeLessThan(2);
  });
});
