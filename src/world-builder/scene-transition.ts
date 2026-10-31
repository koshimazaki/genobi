import type { SceneMotion, SceneTransform } from "./scene-state";
import { WORLD_POSITION_LIMIT } from "./scene-bounds";
import {
  clampSceneValue as clamp,
  mixSceneTransform,
  twistPoint,
  twistRotation,
} from "./scene-transform";

/** Small stable hash: identity, never evaluation order or wall-clock randomness. */
function seedOf(id: string, seed: number) {
  let value = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < id.length; index++)
    value = Math.imul(value ^ id.charCodeAt(index), 16777619) >>> 0;
  return value;
}
function unit(seed: number, offset: number) {
  let value = (seed + Math.imul(offset + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff;
}

/** Authored paths over retained blocks, not a stateful particle simulation. */
export function transitionTransform(
  from: SceneTransform,
  to: SceneTransform,
  progress: number,
  id: string,
  motion: SceneMotion,
): SceneTransform {
  const style = motion.transitionStyle ?? "direct";
  if (style === "direct" || progress <= 0 || progress >= 1)
    return mixSceneTransform(from, to, progress);
  const seed = seedOf(id, motion.instances?.seed ?? 0);
  const t =
    style === "assemble"
      ? clamp((progress - unit(seed, 0) * 0.3) / 0.7, 0, 1)
      : progress;
  const result = mixSceneTransform(from, to, t);
  const pulse = Math.sin(Math.PI * t);
  if (style === "scatter") {
    const reach = Math.min(
      6,
      1.2 + Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * 0.4,
    );
    result.x += (unit(seed, 1) * 2 - 1) * reach * pulse;
    result.y += (0.4 + unit(seed, 2)) * reach * pulse;
    result.z += (unit(seed, 3) * 2 - 1) * reach * pulse;
  } else if (style === "twist") {
    const layer = Math.round(
      (from.y - motion.pivot[1]) / (motion.instances?.spacing ?? 0.8),
    );
    const angle = (Math.abs(layer % 2) ? -1 : 1) * Math.PI * pulse * 0.5;
    const point = twistPoint(
      [
        result.x - motion.pivot[0],
        result.y - motion.pivot[1],
        result.z - motion.pivot[2],
      ],
      0,
      angle,
    );
    const rotation = twistRotation(result, 0, angle);
    [result.x, result.y, result.z] = point.map(
      (value, axis) => value + motion.pivot[axis],
    );
    [result.rotationX, result.rotation, result.rotationZ] = rotation;
  } else if (style === "assemble") {
    result.x += (motion.pivot[0] - result.x) * pulse * 0.85;
    result.y += (motion.pivot[1] - result.y) * pulse * 0.85;
    result.z += (motion.pivot[2] - result.z) * pulse * 0.85;
    result.scale = Math.max(0.1, result.scale * (1 - pulse * 0.82));
  }
  result.x = clamp(result.x, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT);
  result.y = clamp(result.y, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT);
  result.z = clamp(result.z, -WORLD_POSITION_LIMIT, WORLD_POSITION_LIMIT);
  return result;
}
