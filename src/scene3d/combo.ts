/**
 * The camera rig: a plate's opening framing plus its layers, sampled at a
 * normalised time. Ported from Holodeck's `components/ui/CameraControls.tsx`
 * (MIT, Glitch Candies Studio; notice in `src/world-builder/Holodeck-LICENSE.txt`):
 * `updateActiveMove` for a single move and `startComboMove`,
 * `sampleComboLayer` and `applyComboSession` for additive combos. Holodeck
 * advanced those per frame from wall time; here every value is a pure
 * function of `t`, so a preview, the radar and a playblast agree exactly.
 * Offsets are relative to the scene's subject, in Holodeck's units.
 */
import {
  applyCameraEase,
  clamp01,
  type CameraEaseKey,
} from "../../shared/camera-ease";
import {
  CAMERA_MOVE_BY_KEY,
  type CameraMoveKey,
} from "../world-builder/camera-moves";
import type { CameraPlate } from "./plates";
import type { Vec3 } from "./scenes";

export interface RigSettings {
  ease: CameraEaseKey;
  /** Combo amount: Holodeck's `cameraComboStrength`. */
  strength: number;
  /** Seconds a combo layer takes to reach full weight: `cameraComboBlendSec`. */
  morph: number;
  /** The plate's length in seconds. */
  duration: number;
}

/** Holodeck's defaults and slider ranges. */
export const DEFAULT_RIG: RigSettings = {
  ease: "easeInOutCubic",
  strength: 0.85,
  morph: 1.25,
  duration: 5,
};
export const RIG_LIMITS = {
  strength: { min: 0.2, max: 1.15, step: 0.05 },
  morph: { min: 0.1, max: 6, step: 0.1 },
} as const;

export interface RigOffsets {
  offset: Vec3;
  look: Vec3;
}

export interface LayerReading {
  move: CameraMoveKey;
  /** 0..1 through the layer's own span. */
  phase: number;
  /** 0..1 morph weight (already eased). */
  weight: number;
  /** The move's end offset, for the radar. */
  end: Vec3;
}

export interface RigSample extends RigOffsets {
  layers: LayerReading[];
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => [
  lerp(a[0], b[0], u),
  lerp(a[1], b[1], u),
  lerp(a[2], b[2], u),
];

/** The opening framing: a follow move's offset and look offset. */
export function plateStart(plate: CameraPlate): RigOffsets {
  const move = CAMERA_MOVE_BY_KEY[plate.from];
  if (move.kind !== "follow")
    throw new Error(`Plate ${plate.id} must open on a follow framing.`);
  return { offset: [...move.offset], look: [...move.lookOffset] };
}

/** Where a move ends, as an offset, for the radar's end markers. */
export function moveEnd(key: CameraMoveKey, from: RigOffsets): Vec3 {
  const move = CAMERA_MOVE_BY_KEY[key];
  if (move.kind === "follow") return [...move.offset];
  if (move.kind === "static") return [...move.position];
  const start = Math.atan2(from.offset[0], from.offset[2]);
  const angle = start + (move.degrees * Math.PI) / 180;
  return [
    Math.sin(angle) * move.radius,
    move.height,
    Math.cos(angle) * move.radius,
  ];
}

/** `sampleComboLayer`: a layer's offsets at eased progress `u` from `neutral`. */
function sampleLayer(
  key: CameraMoveKey,
  neutral: RigOffsets,
  u: number,
): RigOffsets {
  const move = CAMERA_MOVE_BY_KEY[key];
  if (move.kind === "follow")
    return {
      offset: lerp3(neutral.offset, move.offset, u),
      look: lerp3(neutral.look, move.lookOffset, u),
    };
  if (move.kind !== "orbit")
    throw new Error(`${key} is not a follow or orbit move.`);
  const [x, y, z] = neutral.offset;
  const angle = Math.atan2(x, z) + ((move.degrees * Math.PI) / 180) * u;
  const radius = lerp(Math.max(0.001, Math.hypot(x, z)), move.radius, u);
  const height = lerp(y, move.height, u);
  return {
    offset: [Math.sin(angle) * radius, height, Math.cos(angle) * radius],
    look: lerp3(neutral.look, move.lookOffset, u),
  };
}

/**
 * The rig at normalised time `t`. A preset plays its move at full strength
 * with no morph (Holodeck's single move). A combo adds each layer's change
 * from its neutral framing, weighted by the eased morph and the amount
 * (Holodeck's combo session). A layer's neutral is the rig's framing when it
 * starts, as Holodeck snapshots the camera when a combo key is pressed.
 */
export function sampleRig(
  plate: CameraPlate,
  rig: RigSettings,
  t: number,
): RigSample {
  const start = plateStart(plate);
  const seconds = clamp01(t) * rig.duration;
  const combo = plate.kind === "combo";
  const strength = combo ? rig.strength : 1;
  const neutrals: RigOffsets[] = [];
  const at = (index: number, s: number) => {
    const layer = plate.layers[index];
    const begin = layer.at * rig.duration;
    const length = Math.max(1e-6, layer.span * rig.duration);
    const phase = s < begin ? 0 : clamp01((s - begin) / length);
    const weight =
      s < begin
        ? 0
        : combo
          ? applyCameraEase(rig.ease, clamp01((s - begin) / rig.morph))
          : 1;
    return { phase, weight };
  };
  const compose = (s: number, count: number): RigOffsets => {
    const offset: Vec3 = [...start.offset];
    const look: Vec3 = [...start.look];
    for (let i = 0; i < count; i++) {
      const { phase, weight } = at(i, s);
      if (weight === 0) continue;
      const neutral = neutrals[i];
      const sample = sampleLayer(
        plate.layers[i].move,
        neutral,
        applyCameraEase(rig.ease, phase),
      );
      for (let n = 0; n < 3; n++) {
        offset[n] += (sample.offset[n] - neutral.offset[n]) * weight * strength;
        look[n] += (sample.look[n] - neutral.look[n]) * weight * strength;
      }
    }
    return { offset, look };
  };
  plate.layers.forEach((layer, i) => {
    neutrals[i] = compose(layer.at * rig.duration, i);
  });
  const result = compose(seconds, plate.layers.length);
  return {
    ...result,
    layers: plate.layers.map((layer, i) => ({
      move: layer.move,
      ...at(i, seconds),
      end: moveEnd(layer.move, neutrals[i]),
    })),
  };
}
