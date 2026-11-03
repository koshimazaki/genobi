import { validateRecipe } from "../src/world-builder/recipe";
import {
  motionInstances,
  sceneTransformOf,
  type SceneMotion,
  type SceneRoom,
} from "../src/world-builder/scene-state";

export function motionRoom(): SceneRoom {
  return {
    id: "room",
    dimensions: [4, 3, 4],
    center: [0, 0, 0],
    source: [-1, 1, 0],
    listener: [1, 1, 0],
    seed: 42,
    absorption: {
      floor: 0.3,
      ceiling: 0.2,
      north: 0.2,
      south: 0.2,
      east: 0.2,
      west: 0.2,
    },
    wallThickness: 0.1,
    visible: true,
    cutaway: true,
  };
}
export function motionRecipe(keyCount = 3, count = 8) {
  const instances: NonNullable<SceneMotion["instances"]> = {
    generator: "voxel-lattice",
    version: 1,
    seed: 19,
    count,
    columns: 2,
    spacing: 0.8,
    size: 0.5,
    palette: ["#b9dc69", "#d9d4bf"],
  };
  const base = motionInstances(instances);
  const motion: SceneMotion = {
    version: 1,
    pivot: [0, 1, 0],
    instances,
    mappings: [],
    intensity: 1,
    room: motionRoom(),
    stateKeys: Array.from({ length: keyCount }, (_, index) => ({
      id: `state-${index}`,
      label: `State ${index + 1}`,
      frame: keyCount === 1 ? 0 : (index * 96) / (keyCount - 1),
      easing: "easeInOut",
      objects: Object.fromEntries(
        base.map((p, i) => [
          p.id,
          {
            ...sceneTransformOf(p),
            x: p.x + index,
            y: p.y + 1 + index * (i % 2),
            z: p.z - index,
            scale: 0.5 + index / 10,
          },
        ]),
      ),
      room: { dimensions: [4 + index * 2, 3 + index, 4 + index] },
    })),
  };
  return validateRecipe({ objects: [], audioRoutes: [], motion });
}
