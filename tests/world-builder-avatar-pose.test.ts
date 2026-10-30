import { describe, expect, it } from "vitest";
import * as T from "three";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  applyAvatarPose,
  orient,
  ORIENTATIONS,
  readAvatarPose,
  validateAvatarPose,
} from "../src/world-builder/avatar-pose";

const head = (o: T.Object3D) =>
  new T.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
const front = (o: T.Object3D) =>
  new T.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
const near = (a: T.Vector3, b: [number, number, number]) =>
  expect(a.toArray().map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual(b);

describe("World Builder avatar orientation", () => {
  it("loads a recipe saved before pitch and roll existed unchanged", () => {
    const old = { x: 1, y: 0, z: 2, yaw: 0.5 };
    const r = validateRecipe({
      ...presetRecipe("Playground avatar"),
      avatarPose: old,
    });
    expect(r.avatarPose).toEqual(old);
    expect(validateRecipe({ scene: "stage" }).avatarPose).not.toHaveProperty(
      "pitch",
    );
  });

  it("round-trips pitch and roll", () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: Math.PI / 2, roll: -1 };
    const r = validateRecipe({ avatarPose: pose });
    expect(validateRecipe(JSON.parse(JSON.stringify(r))).avatarPose).toEqual(
      pose,
    );
  });

  it("rejects out-of-range, non-finite or unknown pose fields", () => {
    for (const avatarPose of [
      { x: 0, y: 0, z: 0, yaw: 0, pitch: 4 },
      { x: 0, y: 0, z: 0, yaw: 0, roll: -4 },
      { x: 0, y: 0, z: 0, yaw: 0, pitch: Number.NaN },
      { x: 0, y: 0, z: 0, yaw: 0, roll: "1" },
      { x: 0, y: 0, z: 0, yaw: 0, tilt: 1 },
      { x: 41, y: 0, z: 0, yaw: 0 },
    ]) {
      expect(() => validateAvatarPose(avatarPose)).toThrow();
      expect(() => validateRecipe({ avatarPose })).toThrow();
    }
  });

  it("applies yaw, then pitch, then roll (Euler YXZ) about the feet", () => {
    const o = new T.Object3D();
    applyAvatarPose(o, {
      x: 1,
      y: 0,
      z: 2,
      yaw: Math.PI / 2,
      pitch: Math.PI / 2,
    });
    expect(o.rotation.order).toBe("YXZ");
    expect(o.position.toArray()).toEqual([1, 0, 2]);
    // Turned to face +X, then tipped forward: the head points along the
    // facing direction and the face points at the floor.
    near(head(o), [1, 0, 0]);
    near(front(o), [0, -1, 0]);
    // XYZ order would have tipped about the world X axis instead.
    const wrong = new T.Object3D();
    wrong.rotation.set(Math.PI / 2, Math.PI / 2, 0, "XYZ");
    expect(head(wrong).x).toBeCloseTo(0);
  });

  it("gives each quick orientation the documented body position", () => {
    const o = new T.Object3D();
    const at = (label: string) => {
      const q = ORIENTATIONS.find((x) => x.label === label)!;
      applyAvatarPose(o, orient({ x: 0, y: 0, z: 0, yaw: 0 }, q.pitch, q.roll));
    };
    at("Upright");
    near(head(o), [0, 1, 0]);
    at("Lie face down");
    near(front(o), [0, -1, 0]);
    at("Lie on back");
    near(front(o), [0, 1, 0]);
    at("On side");
    near(head(o), [-1, 0, 0]);
  });

  it("reads an in-range pose back bit for bit", () => {
    const o = new T.Object3D();
    const pose = {
      x: 0,
      y: 0,
      z: 0,
      yaw: (30 * Math.PI) / 180,
      pitch: (120 * Math.PI) / 180,
    };
    applyAvatarPose(o, pose);
    expect(readAvatarPose(o)).toEqual(pose);
  });

  it("reads a pose back and drops zero pitch and roll", () => {
    const o = new T.Object3D();
    applyAvatarPose(o, { x: 0, y: 0, z: 0, yaw: 1 });
    expect(readAvatarPose(o)).toEqual({ x: 0, y: 0, z: 0, yaw: 1 });
    applyAvatarPose(o, { x: 0, y: 0, z: 0, yaw: 1, roll: 0.5 });
    expect(readAvatarPose(o).roll).toBeCloseTo(0.5);
    expect(orient({ x: 0, y: 0, z: 0, yaw: 0, pitch: 1 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
    });
  });
});
