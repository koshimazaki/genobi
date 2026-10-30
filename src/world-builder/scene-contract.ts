import type { Recipe } from "./recipe";
export const shapes = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "plane",
  "torus",
  "tetrahedron",
  "dodecahedron",
] as const;
export const shapeLabels: Record<(typeof shapes)[number], string> = {
  box: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  cone: "Cone",
  plane: "Wall",
  torus: "Ring",
  tetrahedron: "Pyramid",
  dodecahedron: "Polyhedron",
};
export const playgroundIds = [
  "ramp-10",
  "ramp-20",
  "ramp-30",
  "ramp-45",
  "track",
  "jump-left",
  "jump-right",
  "u-ramp",
  "stairs",
  "slope",
  "pillar",
  "box-a",
  "box-b",
  "car-a",
  "car-b",
  "drone",
];
export const faces = [
  "right",
  "left",
  "top",
  "bottom",
  "front",
  "back",
] as const;
export interface Transform {
  rotation?: number;
  rotationX?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}
export type SurfaceMap = Record<
  string,
  { name: string; type: "image" | "video" }
>;
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validTransform(t: Transform) {
  return (
    [t.rotation, t.rotationX, t.rotationZ].every(
      (v) => v === undefined || number(v, -Math.PI, Math.PI),
    ) &&
    [t.scaleX, t.scaleY, t.scaleZ].every(
      (v) => v === undefined || number(v, 0.1, 8),
    )
  );
}
export function validSurface(target: string, r: Recipe) {
  if (target === "screen/all") return true;
  const [object, face, ...extra] = target.split("/");
  if (extra.length) return false;
  if (object.startsWith("world:"))
    return playgroundIds.includes(object.slice(6)) && face === "all";
  const p = r.objects.find((p) => `prop:${p.id}` === object);
  return (
    !!p &&
    (face === "all" ||
      (p.shape === "box" && faces.includes(face as (typeof faces)[number])))
  );
}
export function validTextures(v: unknown, r: Recipe): v is SurfaceMap {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(v).length <= 8 &&
    Object.entries(v).every(
      ([target, item]) =>
        validSurface(target, r) &&
        item &&
        typeof item === "object" &&
        Object.keys(item).every((k) => ["name", "type"].includes(k)) &&
        typeof item.name === "string" &&
        item.name.length <= 120 &&
        !Array.from(item.name as string).some((c) => c.charCodeAt(0) < 32) &&
        ["image", "video"].includes(item.type),
    )
  );
}
export function scaledAxes(t: Transform & { scale: number }) {
  return [
    t.scale * (t.scaleX ?? 1),
    t.scale * (t.scaleY ?? 1),
    t.scale * (t.scaleZ ?? 1),
  ] as const;
}
