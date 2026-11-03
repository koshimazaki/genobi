import type { SceneTransform } from "./scene-state";
import { compactLayouts, pose } from "./motion-layout-utils";

const signedAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));
const trees = [
  { x: -2.2, z: 0.2, height: 3.4 },
  { x: 0.3, z: -1.5, height: 4.1 },
  { x: 2.35, z: 0.7, height: 3.05 },
];

/** Three palms × (8 trunk segments + 6 fronds × 4 segments) = 96 parts. */
export function palmGroveLayouts(): SceneTransform[][] {
  return compactLayouts(
    [0, 1, 2].map((state) => {
      const result: SceneTransform[] = [];
      trees.forEach((tree, treeIndex) => {
        const spread = state === 2 ? 1.22 : 1;
        const rootX = tree.x * spread;
        const rootZ = tree.z * spread;
        const bendX = state === 1 ? 0.7 : state === 2 ? tree.x * 0.13 : 0.1;
        const bendZ = state === 1 ? 0.25 : state === 2 ? -0.12 : 0.03;
        for (let segment = 0; segment < 8; segment++) {
          const fraction = (segment + 0.5) / 8;
          const thickness = 0.29 - fraction * 0.12;
          result.push(
            pose(
              rootX + bendX * fraction * fraction,
              tree.height * fraction,
              rootZ + bendZ * fraction * fraction,
              1,
              {
                scaleX: thickness,
                scaleY: tree.height / 8 + 0.03,
                scaleZ: thickness,
                rotationZ: -Math.atan2(2 * bendX * fraction, tree.height),
                rotationX: Math.atan2(2 * bendZ * fraction, tree.height),
              },
            ),
          );
        }
        for (let frond = 0; frond < 6; frond++) {
          const angle =
            (frond * Math.PI * 2) / 6 +
            treeIndex * 0.22 +
            (state === 1 ? 0.12 : 0);
          const length = state === 2 ? 0.56 : 0.47;
          for (let segment = 0; segment < 4; segment++) {
            const radius = (segment + 0.5) * length;
            const droop = 0.055 * segment * segment;
            result.push(
              pose(
                rootX +
                  bendX +
                  Math.cos(angle) * radius +
                  (state === 1 ? segment * 0.045 : 0),
                tree.height + 0.08 - droop + (state === 2 ? segment * 0.1 : 0),
                rootZ + bendZ + Math.sin(angle) * radius,
                1,
                {
                  scaleX: length + 0.07,
                  scaleY: 0.12,
                  scaleZ: 0.32 - segment * 0.055,
                  rotation: signedAngle(-angle),
                  rotationZ: Math.atan2(
                    -0.11 * segment + (state === 2 ? 0.1 : 0),
                    length,
                  ),
                },
              ),
            );
          }
        }
      });
      return result;
    }),
  );
}
