import { describe, it, expect } from "vitest";
import {
  validateRecipe,
  defaultRecipe,
  cameraAt,
  presetRecipe,
} from "../src/world-builder/recipe";
import { routeValue } from "../src/world-builder/mod-routes";
// The single route's level: the first route its fields migrate to.
const audioLevel = (r: ReturnType<typeof validateRecipe>, frame: number) =>
  routeValue(r, r.audioRoutes[0], frame);
import { shapes, scaledAxes } from "../src/world-builder/scene-contract";
import { geometryFor } from "../src/world-builder/geometry";
import { CAMERA_MOVES } from "../src/world-builder/camera-moves";
import { shotPatch } from "../src/world-builder/camera-shots";
import { analyseBands } from "../src/world-builder/audio";
import { createSceneMedia } from "../src/world-builder/scene-media";
describe("World Builder authoring", () => {
  it("replays every menu preset and keeps acoustic set dimensions editable", () => {
    for (const name of [
      "Playground",
      "Playground avatar",
      "Studio",
      "Monument",
      "Projection",
      "Small room",
      "Acoustic room",
      "Club",
      "Cathedral",
    ])
      expect(
        validateRecipe(JSON.parse(JSON.stringify(presetRecipe(name)))),
      ).toEqual(presetRecipe(name));
    for (const [name, width, length, height] of [
      ["Acoustic room", 6.2, 9.3, 2.9],
      ["Club", 4.82, 6.2, 2.48],
    ] as const) {
      const r = presetRecipe(name);
      const floor = r.objects.find((p) => p.id === "room-floor")!;
      expect([floor.scaleX! * 2, floor.scaleY! * 2]).toEqual([width, length]);
      expect(floor.rotationX).toBe(-Math.PI / 2);
      const back = r.objects.find((p) => p.id === "room-north")!;
      expect(back.z).toBe(-length / 2);
      expect(back.scaleY! * 2).toBe(height);
      expect(r.avatar).toBe(true);
      expect(r.avatarPose).toMatchObject({ x: 0, y: 0, z: 0 });
    }
  });
  it("replays a wall's independent dimensions and complete rotation through JSON", () => {
    const wall = {
      ...defaultRecipe.objects[0],
      id: "wall",
      shape: "box",
      scale: 1,
      scaleX: 4,
      scaleY: 2,
      scaleZ: 0.2,
      rotationX: 0.2,
      rotation: 0.5,
      rotationZ: 0.1,
    };
    const r = validateRecipe({
      objects: [wall],
      textures: {
        "prop:wall/front": { name: "look.png", type: "image" },
        "prop:wall/back": { name: "motion.webm", type: "video" },
      },
    });
    const replay = validateRecipe(JSON.parse(JSON.stringify(r)));
    expect(scaledAxes(replay.objects[0])).toEqual([4, 2, 0.2]);
    expect(replay.textures).toEqual(r.textures);
  });
  it("rejects unknown surfaces, excessive textures and malformed transforms", () => {
    for (const patch of [
      { objects: [{ ...defaultRecipe.objects[0], scaleX: 0 }] },
      { objects: [{ ...defaultRecipe.objects[0], rotationZ: Infinity }] },
      { textures: { "prop:missing/front": { name: "a", type: "image" } } },
      { textures: { "prop:subject/front": { name: "a", type: "image" } } },
      { textures: { "screen/all": { name: "a", type: "script" } } },
    ])
      expect(() => validateRecipe(patch)).toThrow();
  });
  it("produces nondegenerate geometry for every palette item", () => {
    for (const shape of shapes) {
      const g = geometryFor(shape);
      g.computeBoundingBox();
      expect(g.boundingBox!.isEmpty()).toBe(false);
      expect(
        g.index?.count ?? g.getAttribute("position").count,
      ).toBeGreaterThan(0);
      expect(
        Array.from(g.getAttribute("position").array).every(Number.isFinite),
      ).toBe(true);
      g.dispose();
    }
  });
  it("keeps original Holodeck shots valid and anchored to the chosen subject", () => {
    const r = presetRecipe("Studio");
    for (const move of CAMERA_MOVES) {
      const shot = validateRecipe({
        ...r,
        ...shotPatch(move.key, r, [3, 1, -2]),
      });
      expect(cameraAt(shot, 0).every(Number.isFinite)).toBe(true);
      // A move may aim ahead of the subject (`skydive` looks past the head).
      const [lx, , lz] = move.kind === "static" ? [0, 0, 0] : move.lookOffset;
      expect(shot.targetX).toBe(3 + lx);
      expect(shot.targetZ).toBe(-2 + lz);
    }
    const push = validateRecipe({ ...r, ...shotPatch("pushIn", r) });
    const target = [push.targetX, push.targetY, push.targetZ];
    const distance = (frame: number) =>
      Math.hypot(...cameraAt(push, frame).map((v, i) => v - target[i]));
    expect(distance(96)).toBeLessThan(distance(0));
  });
  it("eases motion at the endpoints without changing its framing", () => {
    const linear = validateRecipe({ orbit: 90 }),
      eased = validateRecipe({ ...linear, cameraCurve: "easeInOut" });
    expect(cameraAt(eased, 0)).toEqual(cameraAt(linear, 0));
    expect(cameraAt(eased, 96)).toEqual(cameraAt(linear, 96));
    expect(cameraAt(eased, 12)).not.toEqual(cameraAt(linear, 12));
  });
  it("separates low and high frequency signals on the capture grid", () => {
    const rate = 48000;
    const tone = (hz: number) =>
      new Float32Array(rate).map(
        (_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / rate),
      );
    const low = analyseBands([tone(60)], rate),
      high = analyseBands([tone(8000)], rate);
    expect(low.low[10]).toBeGreaterThan(low.high[10] * 10);
    expect(high.high[10]).toBeGreaterThan(high.low[10] * 10);
    expect(low.low).toHaveLength(24);
    const gated = validateRecipe({
      audioBand: "low",
      audioGain: 2,
      audioGate: 0.2,
      bandEnvelopes: { low: [0.1, 0.5], mid: [], high: [] },
    });
    expect(audioLevel(gated, 0)).toBe(0);
    expect(audioLevel(gated, 1)).toBe(1);
  });
  it("refuses a capture with missing local texture bytes", () => {
    const m = createSceneMedia();
    expect(() => m.assertReady(["prop:wall/front"])).toThrow(/Reattach/);
    m.assertReady([]);
    m.dispose();
  });
});
