/**
 * Starter gestures: small camera or object motions laid over any plate, as
 * data. "A push in with a tilt" is the Push in plate plus Tilt up; "an orbit
 * with a rise" is Quarter orbit plus Rise. A new gesture is a new entry here,
 * which is what an agent command will add later.
 */
import {
  applyCameraEase,
  clamp01,
  type CameraEaseKey,
} from "../../shared/camera-ease";
import type { CameraPathPose } from "../../shared/camera-path";

export interface CameraGesture {
  id: string;
  label: string;
  summary: string;
  target: "camera";
  /** Camera height gained by the end, in Holodeck units. */
  rise?: number;
  /** Look point raised by the end, in Holodeck units. */
  tilt?: number;
  /** Roll by the end, degrees. */
  roll?: number;
  /** Fraction the field of view narrows by the end. */
  zoom?: number;
  ease: CameraEaseKey;
}

export interface ObjectGesture {
  id: string;
  label: string;
  summary: string;
  target: "object";
  /** Hero turn by the end, degrees about the vertical. */
  spin?: number;
  /** Hero lift at the middle of the clip, in Holodeck units. */
  bob?: number;
  ease: CameraEaseKey;
}

export type Gesture = CameraGesture | ObjectGesture;

export const GESTURES: readonly Gesture[] = [
  {
    id: "tilt-up",
    label: "Tilt up",
    summary: "The look point rises as the move plays.",
    target: "camera",
    tilt: 1.4,
    ease: "smoothstep",
  },
  {
    id: "rise",
    label: "Rise",
    summary: "The camera gains height as the move plays.",
    target: "camera",
    rise: 2.5,
    ease: "sineInOut",
  },
  {
    id: "dutch",
    label: "Dutch angle",
    summary: "The camera rolls eight degrees.",
    target: "camera",
    roll: 8,
    ease: "easeInOutCubic",
  },
  {
    id: "slow-zoom",
    label: "Slow zoom",
    summary: "The lens narrows by a fifth.",
    target: "camera",
    zoom: 0.2,
    ease: "linear",
  },
  {
    id: "turntable",
    label: "Turntable",
    summary: "The hero object turns 120 degrees.",
    target: "object",
    spin: 120,
    ease: "easeInOutCubic",
  },
  {
    id: "float",
    label: "Float",
    summary: "The hero object lifts and settles.",
    target: "object",
    bob: 0.35,
    ease: "sineInOut",
  },
];

export const GESTURE_BY_ID: Record<string, Gesture> = Object.fromEntries(
  GESTURES.map((g) => [g.id, g]),
);

/** Camera gestures over a pose at time `t`; `scale` is the scene's. */
export function applyCameraGestures(
  pose: CameraPathPose,
  gestures: readonly Gesture[],
  t: number,
  scale: number,
): CameraPathPose {
  const out: CameraPathPose = {
    position: [...pose.position],
    target: [...pose.target],
    fov: pose.fov,
    roll: pose.roll,
  };
  for (const g of gestures) {
    if (g.target !== "camera") continue;
    const u = applyCameraEase(g.ease, clamp01(t));
    out.position[1] += (g.rise ?? 0) * scale * u;
    out.target[1] += (g.tilt ?? 0) * scale * u;
    out.roll += (g.roll ?? 0) * u;
    out.fov *= 1 - (g.zoom ?? 0) * u;
  }
  return out;
}

export interface ObjectPose {
  /** Radians about the vertical. */
  spin: number;
  /** Scene units. */
  lift: number;
}

/** Object gestures on the hero at time `t`. */
export function objectPose(
  gestures: readonly Gesture[],
  t: number,
  scale: number,
): ObjectPose {
  const pose = { spin: 0, lift: 0 };
  for (const g of gestures) {
    if (g.target !== "object") continue;
    const u = applyCameraEase(g.ease, clamp01(t));
    pose.spin += (((g.spin ?? 0) * Math.PI) / 180) * u;
    pose.lift += (g.bob ?? 0) * scale * Math.sin(Math.PI * u);
  }
  return pose;
}
