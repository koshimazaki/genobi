import { it, expect } from "vitest";
import * as T from "three";
import { Octree } from "three/addons/math/Octree.js";
import { createWalker } from "../src/world-builder/walking";
function fixture() {
  const group = new T.Group();
  const floor = new T.Mesh(new T.BoxGeometry(20, 1, 20));
  floor.position.y = -0.5;
  const wall = new T.Mesh(new T.BoxGeometry(10, 4, 0.2));
  wall.position.set(0, 2, -2);
  group.add(floor, wall);
  group.updateMatrixWorld(true);
  return new Octree().fromGraphNode(group);
}
it("walks on the floor and stops at solid geometry", () => {
  const walker = createWalker(fixture(), new T.Vector3(0, 1, 2));
  let p = new T.Vector3();
  for (let i = 0; i < 240; i++)
    p = walker.step(1 / 60, new T.Vector3(0, 0, -1));
  expect(p.y).toBeCloseTo(0, 2);
  expect(p.z).toBeGreaterThan(-1.7);
  expect(p.z).toBeLessThan(-1.5);
});
it("bounds slow-frame movement and settles without input", () => {
  const walker = createWalker(fixture(), new T.Vector3(0, 1, 2));
  expect(walker.step(10, new T.Vector3(1, 0, 0)).x).toBeCloseTo(0.15);
  let p = new T.Vector3();
  for (let i = 0; i < 120; i++) p = walker.step(1 / 60, new T.Vector3());
  expect(p.y).toBeCloseTo(0, 2);
  expect(p.x).toBeCloseTo(0.15);
});

it("uses human-scale clearance: a 1.8 metre mannequin fits a 2 m doorway but not a 1.65 m opening", () => {
  const travel = (clearance: number) => {
    const room = new T.Group();
    const floor = new T.Mesh(new T.BoxGeometry(20, 1, 20));
    floor.position.y = -0.5;
    const lintel = new T.Mesh(new T.BoxGeometry(10, 2, 0.2));
    lintel.position.set(0, clearance + 1, -2);
    room.add(floor, lintel);
    room.updateMatrixWorld(true);
    const walker = createWalker(
      new Octree().fromGraphNode(room),
      new T.Vector3(0, 0, 2),
    );
    let position = new T.Vector3();
    for (let frame = 0; frame < 120; frame++)
      position = walker.step(1 / 60, new T.Vector3(0, 0, -1));
    return position.clone();
  };
  expect(travel(1.65).z).toBeGreaterThan(-2);
  expect(travel(2).z).toBeLessThan(-3);
});

it("walks in an elevated life-size room without the old miniature-world reset", () => {
  const room = new T.Group();
  const floor = new T.Mesh(new T.BoxGeometry(20, 1, 20));
  floor.position.set(100, 79.5, 0);
  room.add(floor);
  room.updateMatrixWorld(true);
  const walker = createWalker(
    new Octree().fromGraphNode(room),
    new T.Vector3(100, 81, 2),
  );
  let position = new T.Vector3();
  for (let frame = 0; frame < 120; frame++)
    position = walker.step(1 / 60, new T.Vector3(1, 0, 0));
  expect(position.x).toBeGreaterThan(105);
  expect(position.y).toBeCloseTo(80, 2);
});
