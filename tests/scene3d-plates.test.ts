import { describe, expect, it } from "vitest";
import { applyCameraEase, CAMERA_EASES } from "../shared/camera-ease";
import { distance, sampleCameraPath } from "../shared/camera-path";
import { playblastFrames } from "../shared/camera-path-playblast";
import { CAMERA_MOVE_BY_KEY } from "../src/world-builder/camera-moves";
import { DEFAULT_RIG, plateStart, sampleRig } from "../src/scene3d/combo";
import { GESTURES, GESTURE_BY_ID, objectPose } from "../src/scene3d/gestures";
import {
  isLayerMove,
  MAX_PLATE_LAYERS,
  PLATE_BY_ID,
  PLATES,
} from "../src/scene3d/plates";
import {
  plateCameraPath,
  platePose,
  plateTrace,
} from "../src/scene3d/plate-path";
import { SCENE_BY_ID, SCENES } from "../src/scene3d/scenes";

const rig = { ...DEFAULT_RIG, duration: 5 };
const set = SCENE_BY_ID.set;
const close = (a: number[], b: number[], digits = 6) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe("camera plates", () => {
  it("ships ten plates with unique ids, presets and combos", () => {
    expect(PLATES).toHaveLength(10);
    expect(new Set(PLATES.map((p) => p.id)).size).toBe(10);
    expect(PLATES.filter((p) => p.kind === "combo").length).toBeGreaterThan(1);
    for (const plate of PLATES) {
      expect(CAMERA_MOVE_BY_KEY[plate.from].kind).toBe("follow");
      expect(plate.layers.length).toBeGreaterThan(0);
      expect(plate.layers.length).toBeLessThanOrEqual(MAX_PLATE_LAYERS);
      if (plate.kind === "preset") expect(plate.layers).toHaveLength(1);
      for (const layer of plate.layers) {
        expect(isLayerMove(layer.move)).toBe(true);
        expect(layer.at).toBeGreaterThanOrEqual(0);
        expect(layer.at + layer.span).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("starts every plate on its opening framing", () => {
    for (const plate of PLATES) {
      const start = plateStart(plate);
      const at0 = sampleRig(plate, rig, 0);
      close(at0.offset, start.offset);
      close(at0.look, start.look);
    }
  });

  it("lands a follow preset exactly on its move", () => {
    const end = sampleRig(PLATE_BY_ID["push-in"], rig, 1);
    const push = CAMERA_MOVE_BY_KEY.pushIn;
    if (push.kind !== "follow") throw new Error("pushIn is a follow move");
    close(end.offset, [...push.offset]);
    const mid = sampleRig(PLATE_BY_ID["push-in"], rig, 0.5);
    // Cubic S at 0.5 is exactly half way from pullOut to pushIn.
    close(mid.offset, [0, (4.8 + 2) / 2, (18 + 4.2) / 2]);
  });

  it("turns an orbit preset by its degrees to its radius and height", () => {
    const plate = PLATE_BY_ID["quarter-orbit"];
    const start = sampleRig(plate, rig, 0).offset;
    const end = sampleRig(plate, rig, 1).offset;
    const a0 = Math.atan2(start[0], start[2]);
    const a1 = Math.atan2(end[0], end[2]);
    expect(a1 - a0).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.hypot(end[0], end[2])).toBeCloseTo(11, 6);
    expect(end[1]).toBeCloseTo(3.8, 6);
  });

  it("adds combo layers as weighted offsets from their neutral framing", () => {
    const plate = PLATE_BY_ID["push-orbit"];
    // Before the second layer starts only the orbit contributes.
    const early = sampleRig(plate, rig, 0.2);
    expect(early.layers[1].weight).toBe(0);
    expect(early.layers[0].weight).toBeGreaterThan(0);
    // Amount scales the change from the opening framing linearly.
    const full = sampleRig(plate, { ...rig, strength: 1 }, 0.2).offset;
    const half = sampleRig(plate, { ...rig, strength: 0.5 }, 0.2).offset;
    const start = plateStart(plate).offset;
    close(
      half.map((v, n) => v - start[n]),
      full.map((v, n) => (v - start[n]) / 2),
    );
    // A shorter morph reaches full weight sooner.
    const quick = sampleRig(plate, { ...rig, morph: 0.1 }, 0.1);
    const slow = sampleRig(plate, { ...rig, morph: 4 }, 0.1);
    expect(quick.layers[0].weight).toBe(1);
    expect(slow.layers[0].weight).toBeLessThan(0.1);
  });

  it("ignores amount and morph on a preset, as Holodeck's single move does", () => {
    const plate = PLATE_BY_ID["half-orbit"];
    const a = sampleRig(plate, { ...rig, strength: 0.2, morph: 6 }, 0.6);
    const b = sampleRig(plate, rig, 0.6);
    close(a.offset, b.offset);
  });
});

describe("curves", () => {
  it("every ease maps 0 to 0 and 1 to 1 and stays in range", () => {
    for (const ease of CAMERA_EASES) {
      expect(applyCameraEase(ease, 0)).toBeCloseTo(0, 12);
      expect(applyCameraEase(ease, 1)).toBeCloseTo(1, 12);
      for (let i = 0; i <= 20; i++) {
        const v = applyCameraEase(ease, i / 20);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("changes the plate's pace, not its end points", () => {
    const plate = PLATE_BY_ID["pull-out"];
    const linear = { ...rig, ease: "linear" as const };
    const easeIn = { ...rig, ease: "easeInCubic" as const };
    close(
      sampleRig(plate, linear, 1).offset,
      sampleRig(plate, easeIn, 1).offset,
    );
    expect(sampleRig(plate, easeIn, 0.3).offset[2]).toBeLessThan(
      sampleRig(plate, linear, 0.3).offset[2],
    );
  });
});

describe("gestures", () => {
  it("are data on top of a plate and start from rest", () => {
    expect(GESTURES.length).toBeGreaterThanOrEqual(4);
    const plate = PLATE_BY_ID["push-in"];
    const plain = platePose(plate, set, rig, [], 0);
    const tilted = platePose(plate, set, rig, [GESTURE_BY_ID["tilt-up"]], 0);
    expect(tilted).toEqual(plain);
    const end = platePose(plate, set, rig, [GESTURE_BY_ID["tilt-up"]], 1);
    const endPlain = platePose(plate, set, rig, [], 1);
    expect(end.target[1] - endPlain.target[1]).toBeCloseTo(1.4, 3);
  });

  it("roll, rise and zoom reach their amounts at the end", () => {
    const plate = PLATE_BY_ID["quarter-orbit"];
    const g = ["dutch", "rise", "slow-zoom"].map((id) => GESTURE_BY_ID[id]);
    const end = platePose(plate, set, rig, g, 1);
    const plain = platePose(plate, set, rig, [], 1);
    expect(end.roll).toBeCloseTo(8, 3);
    expect(end.position[1] - plain.position[1]).toBeCloseTo(2.5, 3);
    expect(end.fov).toBeCloseTo(set.fov * 0.8, 2);
  });

  it("object gestures move the hero, not the camera", () => {
    const g = [GESTURE_BY_ID.turntable, GESTURE_BY_ID.float];
    const plate = PLATE_BY_ID["push-in"];
    expect(platePose(plate, set, rig, g, 0.5)).toEqual(
      platePose(plate, set, rig, [], 0.5),
    );
    expect(objectPose(g, 1, 1).spin).toBeCloseTo((120 * Math.PI) / 180, 6);
    expect(objectPose(g, 0.5, 1).lift).toBeCloseTo(0.35, 6);
    expect(objectPose(g, 1, 1).lift).toBeCloseTo(0, 6);
  });
});

describe("plates on every scene", () => {
  const frames = playblastFrames(5);
  it("uses LTX's 5 s as 121 frames", () => expect(frames).toBe(121));

  for (const scene of SCENES)
    for (const plate of PLATES)
      it(`${plate.id} on ${scene.id} is a valid path above the floor`, () => {
        const all = GESTURES.filter((g) => g.target === "camera");
        for (const gestures of [[], all]) {
          const path = plateCameraPath(plate, scene, rig, gestures, frames);
          expect(path.keys).toHaveLength(frames);
          expect(path.duration).toBeCloseTo(120 / 24, 9);
          for (const key of path.keys) {
            expect(key.position[1]).toBeGreaterThan(0.1 * scene.scale);
            // Clear of the hero, which sits within one unit of the subject.
            expect(distance(key.position, scene.subject)).toBeGreaterThan(
              1.5 * scene.scale,
            );
          }
          // The path replays the pose on every frame.
          const pose = platePose(plate, scene, rig, gestures, 60 / 120);
          close(sampleCameraPath(path, 60 / 120).position, pose.position, 4);
        }
      });

  it("traces the radar relative to the subject in Holodeck units", () => {
    const room = SCENE_BY_ID["acoustic-room"];
    const plate = PLATE_BY_ID["wide-orbit"];
    const a = plateTrace(plate, set, rig, []);
    const b = plateTrace(plate, room, rig, []);
    expect(a).toHaveLength(97);
    a.forEach((p, i) => close(p, b[i], 2));
  });
});
