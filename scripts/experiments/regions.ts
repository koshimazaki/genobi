/**
 * Swap regions: where the robot and each morph group (left fruit, right
 * fruit, the single fruit or object) sit on the guide at frame 0, as pixel
 * rectangles. A subject swap is a Klein region edit of the first still, so the
 * agent scales one rectangle to the still's size and edits only that area;
 * nothing is hard-coded per still and nothing is scanned from pixels.
 *
 * The boxes come from the engine itself: `evaluateScene` for the voxels,
 * `mannequinGuide` (the 1.8 m schematic) for the avatar, and `sceneCameraAt`
 * for the frame-0 camera, projected with a Three.js perspective camera at the
 * guide's aspect, as the framing tests do.
 */
import { Euler, PerspectiveCamera, Vector3 } from "three";
import { evaluateScene } from "../../src/world-builder/evaluate-scene";
import { mannequinGuide } from "../../src/world-builder/mannequin-guide";
import type { Prop, Recipe } from "../../src/world-builder/recipe";
import { scaledAxes } from "../../src/world-builder/scene-contract";
import { sceneCameraAt } from "../../src/world-builder/scene-camera";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Each side grows by this share of the box: dancing arms and bursts reach past the rest pose. */
export const REGION_PAD = 0.08;

const halves = (count: number) => (id: string) =>
  Number(id.slice("voxel-".length)) < count / 2 ? "fruit-left" : "fruit-right";
const all = (name: string) => () => name;

/** Which voxel group each study's swap targets; studies not listed have none. */
const GROUPS: Record<string, (count: number) => (id: string) => string> = {
  "fruit-mecha": halves,
  "fruit-mecha-morph": halves,
  "fruit-dance": () => all("fruit"),
  "fruit-apple": () => all("fruit"),
  "fruit-banana": () => all("fruit"),
  "fruit-papaya": () => all("fruit"),
  "fruit-apple-banana": () => all("fruit"),
  "fruit-banana-apple": () => all("fruit"),
  "ship-mecha": () => all("ship"),
  "car-mecha": () => all("car"),
  diamond: () => all("diamond"),
};

function corners(p: Prop) {
  const [sx, sy, sz] = scaledAxes(p).map((v) => v / 2);
  const turn = new Euler(p.rotationX ?? 0, p.rotation ?? 0, p.rotationZ ?? 0);
  const out: Vector3[] = [];
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      for (const dz of [-1, 1])
        out.push(
          new Vector3(dx * sx, dy * sy, dz * sz)
            .applyEuler(turn)
            .add(new Vector3(p.x, p.y, p.z)),
        );
  return out;
}

/**
 * Pixel rectangles on the guide (recipe width x height) at frame 0, padded by
 * REGION_PAD per side and clamped to the frame. Empty when the study has no
 * avatar and no listed voxel group, or no scene camera.
 */
export function studyRegions(
  study: string,
  recipe: Recipe,
): Record<string, Region> {
  const pose = sceneCameraAt(recipe, 0);
  if (!pose) return {};
  const { width, height } = recipe;
  const camera = new PerspectiveCamera(pose.fov, width / height, 0.05, 1000);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  const groups = new Map<string, Prop[]>();
  const add = (name: string, p: Prop) =>
    groups.set(name, [...(groups.get(name) ?? []), p]);
  if (recipe.avatar)
    for (const part of mannequinGuide(recipe, 0)) add("robot", part);
  const group = GROUPS[study];
  if (group) {
    const voxels = evaluateScene(recipe, 0).objects.filter(
      (o) => o.id.startsWith("voxel-") && (o.presence ?? 1) > 0,
    );
    const nameOf = group(voxels.length);
    for (const v of voxels) add(nameOf(v.id), v);
  }
  const regions: Record<string, Region> = {};
  for (const [name, parts] of groups) {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const part of parts)
      for (const c of corners(part)) {
        const n = c.project(camera);
        const px = ((n.x + 1) / 2) * width,
          py = ((1 - n.y) / 2) * height;
        [x0, y0, x1, y1] = [
          Math.min(x0, px),
          Math.min(y0, py),
          Math.max(x1, px),
          Math.max(y1, py),
        ];
      }
    const [padX, padY] = [(x1 - x0) * REGION_PAD, (y1 - y0) * REGION_PAD];
    const left = Math.max(0, Math.floor(x0 - padX)),
      top = Math.max(0, Math.floor(y0 - padY)),
      right = Math.min(width, Math.ceil(x1 + padX)),
      bottom = Math.min(height, Math.ceil(y1 + padY));
    if (right > left && bottom > top)
      regions[name] = { x: left, y: top, w: right - left, h: bottom - top };
  }
  return regions;
}
