import { describe, it, expect } from "vitest";
import {
  defaultRecipe,
  validateRecipe,
  presetRecipe,
  cameraAt,
} from "../src/world-builder/recipe";
import { routeValue } from "../src/world-builder/mod-routes";
// The single route's level: the first route its fields migrate to.
const audioLevel = (r: ReturnType<typeof validateRecipe>, frame: number) =>
  routeValue(r, r.audioRoutes[0], frame);
import { rmsEnvelope, audioWav } from "../src/world-builder/audio";
describe("World Builder replay contract", () => {
  it("validates presets without sharing mutable objects", () => {
    const a = presetRecipe("Studio");
    a.objects[0].x = 12;
    expect(presetRecipe("Studio").objects[0].x).toBe(0);
    for (const name of ["Studio", "Monument", "Projection"])
      expect(validateRecipe(presetRecipe(name)).version).toBe(1);
  });
  it("rejects oversized, unsafe and malformed recipes", () => {
    for (const patch of [
      { width: 1000 },
      { frames: 96 },
      { speed: NaN },
      { url: "https://example.com" },
      { version: 2 },
      { objects: [{ ...defaultRecipe.objects[0], color: "url(x)" }] },
      { objects: [defaultRecipe.objects[0], defaultRecipe.objects[0]] },
      { envelope: [Infinity] },
    ])
      expect(() => validateRecipe({ ...defaultRecipe, ...patch })).toThrow();
  });
  it("uses the requested camera endpoints independent of wall time", () => {
    const r = validateRecipe({
      azimuth: 0,
      elevation: 0,
      targetY: 0,
      radius: 10,
      orbit: 90,
      dolly: -0.5,
    });
    expect(cameraAt(r, 0)).toEqual([0, 0, 10]);
    expect(cameraAt(r, 96)[0]).toBeCloseTo(5);
    expect(cameraAt(r, 96)[2]).toBeCloseTo(0);
    expect(cameraAt(r, 48)).toEqual(cameraAt(r, 48));
  });
  it("analyses channels on a fixed frame grid and pads missing audio with silence", () => {
    const env = rmsEnvelope([new Float32Array([1, 1, 0, 0])], 48, 24);
    expect(env).toEqual([1, 0]);
    expect(audioLevel(validateRecipe({ envelope: env, audioGain: 2 }), 0)).toBe(
      2,
    );
    expect(audioLevel(validateRecipe({ envelope: env }), 2)).toBe(0);
  });
  it("exports a frame-duration-aligned PCM companion", async () => {
    const blob = audioWav(
      { channels: [new Float32Array([1, -1])], sampleRate: 48, envelope: [] },
      0.5,
    );
    const v = new DataView(await blob.arrayBuffer());
    expect(v.getUint32(40, true)).toBe(48);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
    expect(v.getInt16(48, true)).toBe(0);
  });
  it("keeps long audio analysis within the maximum capture length", () => {
    expect(rmsEnvelope([new Float32Array(48 * 60)], 48).length).toBe(241);
  });
});

describe("World Builder editing contract", () => {
  it("loads old recipes and round-trips optional avatar and world edits", () => {
    const old = validateRecipe({ scene: "stage" });
    expect(old.avatar).toBe(false);
    expect(old.targetX).toBe(0);
    const edited = validateRecipe({
      ...presetRecipe("Playground avatar"),
      layout: { "car-a": { x: 3, y: 2, z: 1, rotation: 1, scale: 2 } },
      avatarPose: { x: 1, y: 0, z: 2, yaw: 1 },
    });
    expect(validateRecipe(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
    expect(presetRecipe("Playground").layout).toEqual({});
  });
  it("rejects unbounded or unknown editable world state", () => {
    for (const patch of [
      { avatar: 1 },
      { avatarPose: { x: 0, y: 0, z: 0, yaw: Infinity } },
      { layout: { unknown: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 } } },
      { layout: { "car-a": { x: 0, y: 0, z: 0, rotation: 0, scale: 99 } } },
    ])
      expect(() => validateRecipe(patch)).toThrow();
  });
  it("keeps an offset shot target in the deterministic camera path", () => {
    const r = validateRecipe({
      azimuth: 0,
      elevation: 0,
      orbit: 0,
      radius: 10,
      targetX: 4,
      targetY: 3,
      targetZ: -2,
    });
    expect(cameraAt(r, 0)).toEqual([4, 3, 8]);
    expect(cameraAt(r, 96)).toEqual([4, 3, 8]);
  });
});
