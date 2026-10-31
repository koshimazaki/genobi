import type { SceneTransform } from "./scene-state";
import { compactLayouts, pose } from "./motion-layout-utils";
export { maskLayouts } from "./motion-mask-layouts";
export { palmGroveLayouts } from "./motion-palm-layouts";

/** 128 authored parts: the same hull, cockpit, pods, wings and jets become a robot. */
export function spacecraftLayouts(): SceneTransform[][] {
  const states: SceneTransform[][] = [[], [], []];
  const add = (...parts: [SceneTransform, SceneTransform, SceneTransform]) =>
    parts.forEach((part, state) => states[state].push(part));
  // Hull / torso: 32 cuboids.
  for (let y = 0; y < 4; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 4; x++) {
        const torso = pose(
          (x - 1.5) * 0.43,
          2.45 + y * 0.42,
          (z - 0.5) * 0.42,
          0.39,
        );
        add(
          pose((x - 1.5) * 0.42, 1.9 + z * 0.32, (y - 1.5) * 0.8 - 0.2, 0.34, {
            scaleZ: 2.2,
            scaleY: 0.8,
          }),
          torso,
          { ...torso, y: torso.y + 0.12, z: torso.z - 0.1 },
        );
      }
  // Cockpit / head: 12 cuboids.
  for (let y = 0; y < 2; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 3; x++) {
        const head = pose(
          (x - 1) * 0.36,
          4.25 + y * 0.34,
          (z - 0.5) * 0.36,
          0.33,
        );
        add(
          pose(
            (x - 1) * (0.4 - y * 0.1),
            1.98 + z * 0.3,
            -1.85 - y * 0.55,
            0.32,
            { scaleZ: 1.6 },
          ),
          head,
          { ...head, y: head.y + 0.2, z: head.z + 0.05 },
        );
      }
  // Twin pods / arms: 32 cuboids. Their identities are retained by side and row.
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++)
          add(
            pose(
              side * 1.15 + (x - 0.5) * 0.32,
              1.65 + z * 0.32,
              -0.7 + row * 0.72,
              0.34,
              { scaleZ: 2 },
            ),
            pose(
              side * 1.24 + (x - 0.5) * 0.34,
              3.58 - row * 0.42,
              (z - 0.5) * 0.34,
              0.36,
              { scaleY: 1.1 },
            ),
            pose(
              side * (1.2 + row * 0.46),
              3.65 + row * 0.16 + (x - 0.5) * 0.34,
              (z - 0.5) * 0.34 + 0.2,
              0.36,
              { rotationZ: -side * 1.22, scaleY: 1.1 },
            ),
          );
  // Rear hull / legs: 32 cuboids, with a longer forward foot in the lowest row.
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const leg = pose(
            side * 0.53 + (x - 0.5) * 0.34,
            0.4 + row * 0.52,
            (z - 0.5) * 0.34 + (row === 0 ? 0.18 : 0),
            0.38,
            { scaleY: 1.25, scaleZ: row === 0 ? 1.7 : 1 },
          );
          add(
            pose(
              side * 0.52 + (x - 0.5) * 0.32,
              1.3 + z * 0.32,
              0.3 + row * 0.7,
              0.34,
              { scaleZ: 2 },
            ),
            leg,
            { ...leg, x: leg.x + side * 0.2, rotationZ: -side * 0.08 },
          );
        }
  // Wings: 16 flat tiles, folded behind the torso in the middle state.
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++)
        add(
          pose(
            side * (1.1 + col * 0.75),
            1.95,
            0.4 + row * 0.58 + col * 0.16,
            0.35,
            { scaleX: 1.9, scaleY: 0.28, scaleZ: 1.55 },
          ),
          pose(
            side * (0.92 + row * 0.14),
            3.65 - col * 0.34,
            -0.55 - row * 0.16,
            0.34,
            { scaleX: 0.55, scaleZ: 1.25, rotation: side * 0.2 },
          ),
          pose(
            side * (1.55 + col * 0.65),
            3.75 + col * 0.38 - row * 0.27,
            -0.62 - row * 0.2,
            0.34,
            { scaleX: 1.9, scaleY: 0.28, scaleZ: 1.7, rotationZ: side * 0.5 },
          ),
        );
  // Jets become neck/hip joints, closing the humanoid silhouette.
  for (const side of [-1, 1])
    for (const top of [false, true])
      add(
        pose(side * (top ? 1.15 : 0.52), top ? 1.81 : 1.46, 2.78, 0.34, {
          scaleZ: 1.2,
        }),
        pose(side * (top ? 0.19 : 0.45), top ? 4.02 : 2.24, 0, 0.32),
        pose(side * (top ? 0.19 : 0.6), top ? 4.2 : 2.24, 0, 0.32),
      );
  return compactLayouts(states);
}
