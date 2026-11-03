import type { SceneTransform } from "./scene-state";
import { matchLayout, pose } from "./motion-voxel-layouts";

const block = (
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  rotationZ = 0,
) =>
  pose(x, y, z, 1, {
    scaleX: width,
    scaleY: height,
    scaleZ: depth,
    ...(rotationZ ? { rotationZ } : {}),
  });

/** 64 architectural blocks, reused as a nave, four chambers and a street. */
export function buildingLayouts(): SceneTransform[][] {
  const cathedral: SceneTransform[] = [];
  const bays = [-2.85, -0.95, 0.95, 2.85];
  for (const z of bays) {
    for (const side of [-1, 1]) {
      cathedral.push(block(side * 2.7, 1.7, z, 0.6, 3.4, 0.7));
      cathedral.push(block(side * 1.35, 4, z, 3.05, 0.45, 0.68, -side * 0.43));
      cathedral.push(block(side * 3, 0.55, z, 0.4, 1.1, 1.7));
      cathedral.push(block(side * 0.45, 4.95, z, 0.3, 0.7, 0.4));
    }
  }
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++)
      cathedral.push(
        block((x - 1.5) * 1.55, 0, (z - 1.5) * 1.9, 1.5, 0.16, 1.85),
      );
  for (const side of [-1, 1])
    for (let layer = 0; layer < 4; layer++)
      cathedral.push(
        block(side * 3, 0.65 + layer * 1.2, 3.95, 0.95, 1.15, 0.95),
      );
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 4; x++)
      cathedral.push(
        block((x - 1.5) * 1.55, 0.7 + y * 1.4, -3.95, 1.5, 1.3, 0.4),
      );

  const chambers: SceneTransform[] = [];
  for (const cz of [-2.6, 2.6])
    for (const cx of [-2.5, 2.5]) {
      for (const z of [-0.9, 0.9])
        for (const x of [-0.9, 0.9])
          chambers.push(block(cx + x, 0, cz + z, 1.75, 0.16, 1.75));
      chambers.push(
        block(cx, 1.1, cz - 1.8, 3.6, 2.2, 0.25),
        block(cx - 1.8, 1.1, cz, 0.25, 2.2, 3.6),
        block(cx + 1.8, 1.1, cz, 0.25, 2.2, 3.6),
        block(cx, 2.1, cz + 1.8, 3.6, 0.3, 0.25),
      );
      for (const z of [-1.65, 1.65])
        for (const x of [-1.65, 1.65])
          chambers.push(block(cx + x, 1.25, cz + z, 0.4, 2.5, 0.4));
      chambers.push(
        block(cx, 2.6, cz - 1.75, 3.8, 0.2, 0.35),
        block(cx, 2.6, cz + 1.75, 3.8, 0.2, 0.35),
        block(cx - 1.75, 2.6, cz, 0.35, 0.2, 3.1),
        block(cx + 1.75, 2.6, cz, 0.35, 0.2, 3.1),
      );
    }

  const street: SceneTransform[] = [];
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * 1.8,
      height = 2.2 + ((i * 7) % 5) * 0.52,
      z = -1.3 + (i % 2) * 0.25;
    street.push(block(x, 0, z, 1.65, 0.18, 2.4));
    for (const sx of [-0.4, 0.4])
      for (let y = 0; y < 2; y++)
        street.push(
          block(x + sx, height * (0.25 + y * 0.5), z, 0.76, height * 0.48, 1.9),
        );
    street.push(block(x, height + 0.1, z, 1.7, 0.25, 2.1));
    for (const sx of [-0.39, 0.39])
      street.push(block(x + sx, height * 0.64, z + 1.01, 0.43, 0.65, 0.14));
  }
  const matched = matchLayout(cathedral, chambers);
  return [cathedral, matched, matchLayout(matched, street)];
}

/** Furniture and partitions stay present while the enclosing room opens. */
export const apartmentPieces = [
  ["divider", "#91a39c"],
  ["cross-wall", "#91a39c"],
  ["sofa", "#b7cd67"],
  ["sofa-back", "#b7cd67"],
  ["bed", "#e1ddd1"],
  ["bed-base", "#8c7965"],
  ["counter", "#c1ad82"],
  ["cabinet", "#c1ad82"],
  ["table", "#e2bb63"],
  ["table-leg", "#6d7a75"],
  ["shelf", "#9eae9b"],
  ["plinth", "#6d7a75"],
] as const;

export function apartmentLayouts(): SceneTransform[][] {
  const compact = [
    block(-0.1, 1.15, -0.6, 0.16, 2.3, 2.4),
    block(-1.5, 1.15, 0.5, 2.6, 2.3, 0.16),
    block(1.5, 0.4, 1.05, 1.8, 0.65, 0.9),
    block(1.5, 0.8, 1.45, 1.8, 0.6, 0.2),
    block(-1.5, 0.58, -0.85, 1.5, 0.25, 2.1),
    block(-1.5, 0.29, -0.85, 1.55, 0.32, 2.15),
    block(1.45, 0.55, -1.65, 1.9, 1.05, 0.6),
    block(2.35, 0.55, -0.7, 0.65, 1.05, 1.3),
    block(1.25, 0.72, 0, 1.1, 0.14, 0.65),
    block(1.25, 0.36, 0, 0.22, 0.6, 0.22),
    block(-2.45, 1.25, -1, 0.3, 2.1, 1.8),
    block(-1.8, 0.4, 1.55, 0.6, 0.8, 0.6),
  ];
  const expanded = compact.map((p) =>
    pose(p.x * 1.42, p.y, p.z * 1.4, p.scale, {
      scaleX: (p.scaleX ?? 1) * 1.12,
      scaleY: p.scaleY,
      scaleZ: (p.scaleZ ?? 1) * 1.12,
    }),
  );
  const loft = [
    block(1.65, 0.55, -2.2, 2.8, 1.1, 0.7),
    block(-3.7, 1.3, -2.65, 0.2, 2.6, 2.3),
    block(2.25, 0.4, 1.55, 2.9, 0.65, 1.15),
    block(2.25, 0.8, 2.08, 2.9, 0.6, 0.22),
    block(-2.7, 0.58, -1.95, 2.1, 0.25, 2.5),
    block(-2.7, 0.29, -1.95, 2.15, 0.32, 2.55),
    block(2.4, 0.55, -3.25, 3.8, 1.05, 0.7),
    block(4.3, 0.55, -1.75, 0.7, 1.05, 2.4),
    block(1.75, 0.72, 0.05, 1.8, 0.14, 1),
    block(1.75, 0.36, 0.05, 0.3, 0.6, 0.3),
    block(-4.4, 1.65, 0.1, 0.3, 2.8, 2.9),
    block(-1.9, 0.5, 2.15, 1, 1, 1),
  ];
  return [compact, expanded, loft];
}
