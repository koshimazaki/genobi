import { Euler, Vector3 } from "three";
import type { SceneTransform } from "./scene-state";
import { compactLayouts } from "./motion-layout-utils";
import { scaledAxes } from "./scene-contract";
import { PRIMITIVE_SCALE_RANGE } from "./scene-bounds";

const axes = ["scaleX", "scaleY", "scaleZ"] as const;
const rotation = (part: SceneTransform) =>
  new Euler(part.rotationX ?? 0, part.rotation ?? 0, part.rotationZ ?? 0);
const sizes = (part: SceneTransform) => [...scaledAxes(part)];

export function partBounds(part: SceneTransform) {
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity);
  const size = sizes(part),
    euler = rotation(part);
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const point = new Vector3(x * size[0], y * size[1], z * size[2])
          .multiplyScalar(0.5)
          .applyEuler(euler)
          .add(new Vector3(part.x, part.y, part.z));
        min.min(point);
        max.max(point);
      }
  return { min, max };
}

function withSize(part: SceneTransform, size: number[]): SceneTransform {
  const largest = Math.max(...size);
  // `size` already contains the visible presence factor; do not apply it twice.
  const { presence: _presence, ...authored } = part;
  if (largest === 0)
    return {
      ...authored,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      presence: 0,
    };
  // Very small visible boxes use a residual presence instead of being enlarged
  // to the transform's minimum scale/axis bounds.
  const presence = Math.min(1, Math.min(...size) / 0.01);
  const normalized = size.map((value) => value / presence);
  const low = Math.max(0.1, Math.max(...normalized) / 8);
  const high = Math.min(
    PRIMITIVE_SCALE_RANGE[1],
    Math.min(...normalized) / 0.1,
  );
  if (low > high + 1e-12)
    throw new Error(
      "These boxes cannot be resampled within the supported shape bounds. Use fewer states or a compatible block preset.",
    );
  const scale = Math.max(low, Math.min(high, Math.max(...normalized) / 4));
  return {
    ...authored,
    scale,
    ...(presence < 1 ? { presence } : {}),
    ...Object.fromEntries(
      axes.map((axis, index) => [
        axis,
        Math.max(0.1, Math.min(8, normalized[index] / scale)),
      ]),
    ),
  };
}

/** Splits preserve occupied cuboids; coarse merges are explicit approximations. */
export function resampleMorphParts(input: SceneTransform[], count: number) {
  const parts = structuredClone(input);
  while (parts.length < count) {
    let index = 0;
    for (let i = 1; i < parts.length; i++)
      if (
        sizes(parts[i]).reduce((a, b) => a * b, 1) >
        sizes(parts[index]).reduce((a, b) => a * b, 1)
      )
        index = i;
    const part = parts[index],
      size = sizes(part);
    const axis = size.indexOf(Math.max(...size));
    const offset = new Vector3();
    offset.setComponent(axis, size[axis] / 4).applyEuler(rotation(part));
    size[axis] /= 2;
    parts.splice(
      index,
      1,
      ...[-1, 1].map((sign) =>
        withSize(
          {
            ...part,
            x: part.x + offset.x * sign,
            y: part.y + offset.y * sign,
            z: part.z + offset.z * sign,
          },
          size,
        ),
      ),
    );
  }
  while (parts.length > count) {
    let a = 0,
      b = 1,
      nearest = Infinity;
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const p = parts[i],
          q = parts[j];
        const distance = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
        if (distance < nearest) {
          nearest = distance;
          a = i;
          b = j;
        }
      }
    const first = partBounds(parts[a]),
      second = partBounds(parts[b]);
    const min = first.min.min(second.min),
      max = first.max.max(second.max);
    const center = min.clone().add(max).multiplyScalar(0.5);
    parts[a] = withSize(
      { x: center.x, y: center.y, z: center.z, scale: 1 },
      max.sub(min).toArray(),
    );
    parts.splice(b, 1);
  }
  return parts;
}

/** Centre the selected forms on a common floor and comparable visual scale. */
export function normalizeMorphParts(parts: SceneTransform[]) {
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const part of parts) {
    const bounds = partBounds(part);
    min.min(bounds.min);
    max.max(bounds.max);
  }
  const size = max.clone().sub(min);
  // Power-of-two scaling keeps the authored integer architecture compact.
  const factor =
    2 ** Math.round(Math.log2(8 / Math.max(size.x, size.y, size.z)));
  const center = min.clone().add(max).multiplyScalar(0.5);
  return compactLayouts([
    parts.map((part) => ({
      ...Object.fromEntries(
        Object.entries(part).map(([key, value]) => [
          key,
          typeof value === "number" ? Math.round(value * 100) / 100 : value,
        ]),
      ),
      x: Math.round((part.x - center.x) * factor * 100) / 100,
      y: Math.round(((part.y - min.y) * factor - 0.65) * 100) / 100,
      z: Math.round((part.z - center.z) * factor * 100) / 100,
      scale: Math.max(0.1, Math.round(part.scale * factor * 100) / 100),
    })),
  ])[0];
}
