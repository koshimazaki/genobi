import type { SceneTransform } from "./scene-state";
import { compactLayouts, pose } from "./motion-layout-utils";

/** Original sculptural mask, crown and opened face; 96 stable cuboid parts. */
export function maskLayouts(): SceneTransform[][] {
  const states: SceneTransform[][] = [[], [], []];
  const add = (...parts: [SceneTransform, SceneTransform, SceneTransform]) =>
    parts.forEach((part, state) => states[state].push(part));
  // Explicit row gaps leave eyes and a mouth, instead of filling an ellipsoid.
  const rows = [
    [-0.45, -0.15, 0.15, 0.45],
    [-1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05],
    [-1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05],
    [-1.2, -0.9, -0.6, 0.6, 0.9, 1.2],
    [-1.35, -1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05, 1.35],
    [-1.35, -1.05, -0.15, 0.15, 1.05, 1.35],
    [-1.35, -1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05, 1.35],
    [-1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05],
    [-0.45, -0.15, 0.15, 0.45],
  ];
  rows.forEach((row, index) => {
    for (const x of row) {
      const y = 0.7 + index * 0.4;
      const z = 0.1 + 0.45 * (1 - (x / 1.6) ** 2 - ((y - 2.3) / 2) ** 2);
      const side = Math.sign(x);
      const face = pose(x, y, z, 0.34, {
        scaleX: 0.87,
        scaleY: 1.12,
        scaleZ: 0.72,
      });
      add(
        face,
        {
          ...face,
          x: x * 1.12,
          y: 2.3 + (y - 2.3) * 1.12,
          z: z + 0.1,
          rotationZ: -side * 0.04,
        },
        {
          ...face,
          x: x + side * 0.62,
          y: y + (index > 6 ? 0.35 : index < 2 ? -0.15 : 0),
          z: z - 0.25,
          rotation: side * 0.34,
        },
      );
    }
  });
  // Twelve nose/bridge blocks retain a connected centre as the cheeks open.
  for (let row = 0; row < 3; row++)
    for (let depth = 0; depth < 2; depth++)
      for (const side of [-1, 1]) {
        const nose = pose(
          side * 0.11,
          2.2 + row * 0.28,
          0.55 + depth * 0.22,
          0.23,
          { scaleY: 1.2 },
        );
        add(
          nose,
          { ...nose, y: nose.y + 0.13, z: nose.z + 0.15 },
          { ...nose, x: side * 0.14, y: nose.y + 0.06, z: nose.z + 0.25 },
        );
      }
  // Eight brow pieces mark the empty eye sockets without filling them.
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const brow = pose(
        side * (0.4 + i * 0.25),
        2.98 + Math.sin(i) * 0.05,
        0.69,
        0.26,
        { scaleY: 0.45, rotationZ: -side * 0.08 },
      );
      add(
        brow,
        { ...brow, y: brow.y + 0.28, x: brow.x * 1.12, rotationZ: side * 0.2 },
        {
          ...brow,
          y: brow.y + i * 0.1,
          x: brow.x + side * 0.62,
          rotationZ: side * 0.35,
        },
      );
    }
  // Eight lip pieces, split along the mouth opening.
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 4; col++) {
      const lip = pose((col - 1.5) * 0.27, 1.73 + row * 0.19, 0.6, 0.22, {
        scaleY: 0.5,
        scaleX: 1.1,
      });
      add(
        lip,
        { ...lip, y: 1.65 + row * 0.2, z: 0.73 },
        { ...lip, x: lip.x * 1.4, y: 1.6 + row * 0.3, z: 0.8 },
      );
    }
  // Four short crest pieces rise into a crown and then a fan.
  for (let col = 0; col < 4; col++) {
    const x = (col - 1.5) * 0.4;
    add(
      pose(x, 4.06 + (1.5 - Math.abs(col - 1.5)) * 0.1, 0, 0.28),
      pose(x * 1.25, 4.45 + (1.5 - Math.abs(col - 1.5)) * 0.26, -0.08, 0.28, {
        scaleY: 3,
        rotationZ: -x * 0.24,
      }),
      pose(x * 1.8, 4.65 - Math.abs(x) * 0.24, -0.15, 0.28, {
        scaleY: 2.5,
        rotationZ: -x * 0.65,
      }),
    );
  }
  return compactLayouts(states);
}
