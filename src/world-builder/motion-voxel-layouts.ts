import type { SceneTransform } from "./scene-state";
import { pose, matchLayout } from "./motion-layout-utils";
export { pose, rounded, matchLayout } from "./motion-layout-utils";
export { fruitLayouts } from "./motion-fruit-layouts";

export function voxelStructureLayouts(): SceneTransform[][] {
  const pyramid: SceneTransform[] = [];
  // Nine foundation tiles plus the 55 cells of a five-storey pyramid.
  for (let z = -1; z <= 1; z++)
    for (let x = -1; x <= 1; x++)
      pyramid.push(
        pose(x * 1.35, 0.1, z * 1.35, 0.72, {
          scaleX: 1.8,
          scaleY: 0.28,
          scaleZ: 1.8,
        }),
      );
  for (let layer = 0; layer < 5; layer++) {
    const width = 5 - layer;
    for (let z = 0; z < width; z++)
      for (let x = 0; x < width; x++)
        pyramid.push(
          pose(
            (x - (width - 1) / 2) * 0.78,
            0.56 + layer * 0.76,
            (z - (width - 1) / 2) * 0.78,
            0.72,
          ),
        );
  }
  const cube: SceneTransform[] = [],
    open: SceneTransform[] = [];
  let displaced = 0;
  for (let y = 0; y < 4; y++)
    for (let z = 0; z < 4; z++)
      for (let x = 0; x < 4; x++) {
        cube.push(pose((x - 1.5) * 0.8, 0.4 + y * 0.8, (z - 1.5) * 0.8, 0.72));
        // Move the eight inner cells and the four doorway cells to the roof.
        // Retain every ID, so opening the building never spawns/drops a cell.
        if ((x === 1 || x === 2) && (y === 1 || y === 2) && z >= 1) {
          const i = displaced++;
          open.push(
            pose(
              ((i % 4) - 1.5) * 1.05,
              4.25,
              -1.2 + Math.floor(i / 4) * 0.85,
              0.7,
            ),
          );
        } else {
          open.push(
            pose((x - 1.5) * 1.05, 0.4 + y * 1.05, (z - 1.5) * 1.05, 0.9),
          );
        }
      }
  // Match the pyramid once; preserve cube-layer identity into the open form.
  const matched = matchLayout(pyramid, cube);
  return [pyramid, matched, matched.map((cell) => open[cube.indexOf(cell)])];
}
