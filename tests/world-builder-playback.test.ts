import { describe, it, expect } from "vitest";
import * as T from "three";
import { Octree } from "three/addons/math/Octree.js";
import { createWalker } from "../src/world-builder/walking";
import { previewPosition } from "../src/world-builder/scene-playback";
function walker() {
  const floor = new T.Mesh(new T.PlaneGeometry(100, 100));
  floor.rotation.x = -Math.PI / 2;
  floor.updateMatrixWorld(true);
  return createWalker(
    new Octree().fromGraphNode(floor),
    new T.Vector3(0, 0.01, 0),
  );
}
describe("World Builder playback and character controls", () => {
  it("loops at the exact 24fps take boundary and keeps single playback on its final frame", () => {
    expect(previewPosition(0.375, 9, true)).toEqual({
      frame: 0,
      cycle: 1,
      done: false,
    });
    expect(previewPosition(0.38, 9, false)).toEqual({
      frame: 8,
      cycle: 0,
      done: true,
    });
    expect(previewPosition(10 / 24, 9, true)).toEqual({
      frame: 1,
      cycle: 1,
      done: false,
    });
  });
  it("runs twice as fast while Shift is held and returns to walking speed", () => {
    const w = walker(),
      r = walker(),
      dir = new T.Vector3(1, 0, 0);
    let wp = new T.Vector3(),
      rp = new T.Vector3();
    for (let i = 0; i < 60; i++) {
      wp = w.step(1 / 60, dir).clone();
      rp = r.step(1 / 60, dir, true).clone();
    }
    expect(rp.x).toBeCloseTo(wp.x * 2, 5);
    const before = rp.x;
    rp = r.step(0.05, dir, false).clone();
    expect(rp.x - before).toBeCloseTo(0.15, 5);
  });
  it("jumps only when grounded, lands again and cannot repeatedly jump in midair", () => {
    const w = walker(),
      dir = new T.Vector3();
    expect(w.jump()).toBe(false);
    for (let i = 0; i < 20; i++) w.step(1 / 60, dir);
    expect(w.jump()).toBe(true);
    expect(w.jump()).toBe(false);
    let high = 0;
    for (let i = 0; i < 90; i++) high = Math.max(high, w.step(1 / 60, dir).y);
    expect(high).toBeGreaterThan(1);
    expect(w.jump()).toBe(true);
  });
});
