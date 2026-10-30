/**
 * A plate on a scene as poses and as a shared camera path. Keys sit on the
 * playblast's frame grid, one per frame, so the path replays the clip
 * exactly (the same convention as World Builder's `recipeCameraPath`).
 */
import {
  cameraPathFromSamples,
  type CameraPath,
  type CameraPathPose,
} from "../../shared/camera-path";
import { PLAYBLAST_FPS } from "../../shared/camera-path-playblast";
import { sampleRig, type RigSettings } from "./combo";
import { applyCameraGestures, type Gesture } from "./gestures";
import type { CameraPlate } from "./plates";
import type { SceneSpec, Vec3 } from "./scenes";

const round = (v: number, places = 4) => {
  const f = 10 ** places;
  return Math.round(v * f) / f || 0;
};
const place = (subject: Vec3, offset: Vec3, scale: number): Vec3 =>
  offset.map((v, n) => round(subject[n] + v * scale)) as Vec3;

/** The camera pose of `plate` on `scene` at normalised time `t`. */
export function platePose(
  plate: CameraPlate,
  scene: SceneSpec,
  rig: RigSettings,
  gestures: readonly Gesture[],
  t: number,
): CameraPathPose {
  const sample = sampleRig(plate, rig, t);
  const pose = applyCameraGestures(
    {
      position: place(scene.subject, sample.offset, scene.scale),
      target: place(scene.subject, sample.look, scene.scale),
      fov: scene.fov,
      roll: 0,
    },
    gestures,
    t,
    scene.scale,
  );
  return {
    position: pose.position.map((v) => round(v)) as Vec3,
    target: pose.target.map((v) => round(v)) as Vec3,
    fov: round(pose.fov, 3),
    roll: round(pose.roll, 3),
  };
}

/** One key per frame of a `frames`-long clip at the playblast rate. */
export function plateCameraPath(
  plate: CameraPlate,
  scene: SceneSpec,
  rig: RigSettings,
  gestures: readonly Gesture[],
  frames: number,
  fps = PLAYBLAST_FPS,
): CameraPath {
  const last = frames - 1;
  return cameraPathFromSamples(
    Array.from({ length: frames }, (_, i) => ({
      time: i / fps,
      ...platePose(plate, scene, rig, gestures, i / last),
    })),
  );
}

/** Camera positions relative to the subject, in Holodeck units, for the radar. */
export function plateTrace(
  plate: CameraPlate,
  scene: SceneSpec,
  rig: RigSettings,
  gestures: readonly Gesture[],
  steps = 96,
): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const { position } = platePose(plate, scene, rig, gestures, i / steps);
    return position.map((v, n) => (v - scene.subject[n]) / scene.scale) as Vec3;
  });
}
