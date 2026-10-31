import type { SceneTransform } from "./scene-state";

/** Small authored layouts, never an unbounded voxel expansion. */
export const pose = (
  x: number,
  y: number,
  z: number,
  scale = 1,
  extra: Partial<SceneTransform> = {},
): SceneTransform => ({
  x: rounded(x),
  y: rounded(y),
  z: rounded(z),
  scale: rounded(scale),
  ...extra,
});
export const rounded = (v: number) => Math.round(v * 10000) / 10000;

/** Deterministic nearest matching keeps the same cells through the morph. */
export function matchLayout(
  from: SceneTransform[],
  to: SceneTransform[],
): SceneTransform[] {
  if (from.length !== to.length) throw new Error("Voxel counts must agree.");
  const pairs = from.flatMap((a, i) =>
    to.map((b, j) => ({
      i,
      j,
      d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
    })),
  );
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const seen = new Set<number>(),
    result = new Array<SceneTransform>(from.length);
  for (const { i, j } of pairs) {
    if (result[i] || seen.has(j)) continue;
    result[i] = to[j];
    seen.add(j);
  }
  return result;
}

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

type Score = (x: number, y: number, z: number) => number;
/** Keep the best N lattice cells, with an explicit stable tie-break. */
function field(count: number, spacing: number, score: Score) {
  const cells: { point: SceneTransform; score: number; order: number }[] = [];
  for (let y = -7; y <= 7; y++)
    for (let z = -5; z <= 5; z++)
      for (let x = -8; x <= 8; x++) {
        cells.push({
          point: pose(
            x * spacing,
            y * spacing + 2.25,
            z * spacing,
            spacing * 0.94,
          ),
          score: score(x * spacing, y * spacing, z * spacing),
          order: cells.length,
        });
      }
  return cells
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, count)
    .sort(
      (a, b) =>
        a.point.y - b.point.y || a.point.z - b.point.z || a.point.x - b.point.x,
    )
    .map(({ point }) => point);
}

export function fruitLayouts(): SceneTransform[][] {
  const count = 94,
    spacing = 0.43;
  const banana = field(count, spacing, (x, y, z) => {
    // A tapered arc gives a visible crescent, not merely a bent ellipsoid.
    const radius = 2.15;
    let distance = Infinity;
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * 2 - 1,
        angle = t * 1.13,
        cx = radius * Math.sin(angle),
        cy = radius * (1 - Math.cos(angle)) - 0.5,
        r = 0.21 + 0.42 * (1 - Math.abs(t) ** 2);
      distance = Math.min(
        distance,
        ((x - cx) ** 2 + (y - cy) ** 2 + z ** 2) / r ** 2,
      );
    }
    return distance;
  });
  // The two end cells become a visible stem as the fruit changes identity.
  banana.push(pose(-2.05, 3.15, 0, 0.31), pose(-2.15, 3.4, 0, 0.24));
  const papaya = field(count, spacing, (x, y, z) => {
    const width = 0.94 - 0.2 * Math.max(0, y / 1.8);
    return (x / width) ** 2 + (y / 1.85) ** 2 + (z / 0.91) ** 2;
  });
  papaya.push(pose(0, 4.15, 0, 0.31), pose(0.15, 4.34, 0, 0.24));
  const apple = field(count, spacing, (x, y, z) => {
    const radial = Math.hypot(x, z),
      topDent = Math.max(0, 1 - radial / 0.65) * Math.max(0, y) * 0.32;
    return (x / 1.28) ** 2 + (y / 1.2) ** 2 + (z / 1.23) ** 2 + topDent;
  });
  apple.push(pose(0, 3.65, 0, 0.31), pose(0.17, 3.88, 0, 0.24));
  const matchedPapaya = matchLayout(
    banana.slice(0, count),
    papaya.slice(0, count),
  );
  const matchedApple = matchLayout(matchedPapaya, apple.slice(0, count));
  return [
    banana,
    [...matchedPapaya, ...papaya.slice(count)],
    [...matchedApple, ...apple.slice(count)],
  ];
}
