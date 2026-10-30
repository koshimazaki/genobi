/** Axis-aligned bounds of primitives, shared by the parser and acoustics. */
import type { ScenePrimitive, SceneSpec, Vec3 } from "./types";

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Half extents before rotation, as `build-scene.ts` draws each shape. */
function halfExtents(p: ScenePrimitive): Vec3 {
  const [x, y, z] = p.size;
  switch (p.shape) {
    case "box":
      return [x / 2, y / 2, z / 2];
    case "cylinder":
    case "cone":
      return [x, y / 2, x];
    case "torusKnot":
      return [x * 0.92, x * 0.92, x * 0.92];
    default:
      return [x, x, x];
  }
}

export function primitiveBounds(p: ScenePrimitive): Bounds {
  const [hx, hy, hz] = halfExtents(p);
  const c = Math.abs(Math.cos(p.rotationY ?? 0));
  const s = Math.abs(Math.sin(p.rotationY ?? 0));
  const half: Vec3 = [c * hx + s * hz, hy, s * hx + c * hz];
  return {
    min: p.position.map((v, i) => v - half[i]) as Vec3,
    max: p.position.map((v, i) => v + half[i]) as Vec3,
  };
}

export function union(list: readonly Bounds[]): Bounds | null {
  if (!list.length) return null;
  return {
    min: [0, 1, 2].map((i) => Math.min(...list.map((b) => b.min[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...list.map((b) => b.max[i]))) as Vec3,
  };
}

export const isBoundary = (p: ScenePrimitive) =>
  p.role === "wall" || p.role === "floor" || p.role === "ceiling";

/** The bounding box of the room's walls, floor and ceiling; null without walls. */
export function wallBounds(spec: Pick<SceneSpec, "objects">): Bounds | null {
  if (!spec.objects.some((p) => p.role === "wall")) return null;
  return union(spec.objects.filter(isBoundary).map(primitiveBounds));
}

export const inside = (point: Vec3, b: Bounds) =>
  point.every((v, i) => v >= b.min[i] && v <= b.max[i]);
