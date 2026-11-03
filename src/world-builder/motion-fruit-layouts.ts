import type { SceneTransform } from "./scene-state";
import { matchLayout, pose } from "./motion-layout-utils";

type Score = (x: number, y: number, z: number) => number;

/** A bounded lattice fills an authored implicit volume, not an image scan. */
function field(count: number, spacing: number, score: Score) {
  const extent = Math.ceil(3 / spacing);
  const cells: { point: SceneTransform; score: number; order: number }[] = [];
  for (let y = -extent; y <= extent; y++)
    for (let z = -extent; z <= extent; z++)
      for (let x = -extent; x <= extent; x++) {
        const px = x * spacing;
        const py = y * spacing;
        // Paired half-cell depth planes avoid a single central slab dominating
        // the coarse fruit and keep thickness comparable when detail doubles.
        const pz = (z + 0.5) * spacing;
        cells.push({
          point: pose(px, py + 2.15, pz, spacing * 0.96),
          score: score(px, py, pz),
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

/** Stable body/stem identities at either of two explicitly bounded details. */
export function fruitLayouts(count: 96 | 192 = 96): SceneTransform[][] {
  if (count !== 96 && count !== 192)
    throw new Error("Fruit detail must use 96 or 192 voxels.");
  const stemCount = count / 48;
  const bodyCount = count - stemCount;
  // Twice the cells with cube-root-smaller sides preserves the visible volume.
  const spacing = 0.36 * Math.cbrt(94 / bodyCount);
  const banana = field(bodyCount, spacing, (x, y, z) => {
    let distance = Infinity;
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * 2 - 1;
      const angle = t * 1.07;
      const cx = 2.55 * Math.sin(angle);
      const cy = 2.55 * (1 - Math.cos(angle)) - 0.45;
      const radius = 0.19 + 0.36 * (1 - t * t);
      distance = Math.min(
        distance,
        ((x - cx) ** 2 + (y - cy) ** 2 + (z / 0.92) ** 2) / (radius * radius),
      );
    }
    return distance;
  });
  const papaya = field(bodyCount, spacing, (x, y, z) => {
    const width = 0.83 - 0.16 * Math.max(0, y / 1.7);
    return (x / width) ** 2 + (y / 1.7) ** 2 + (z / 0.76) ** 2;
  });
  const apple = field(bodyCount, spacing, (x, y, z) => {
    const radial = Math.hypot(x, z);
    const topDent = Math.max(0, 1 - radial / 0.55) * Math.max(0, y) * 0.45;
    const shoulders = 1.02 + 0.08 * Math.max(-1, Math.min(1, y));
    return (x / shoulders) ** 2 + (y / 1.03) ** 2 + (z / 0.97) ** 2 + topDent;
  });
  const stems = (kind: "banana" | "papaya" | "apple") =>
    Array.from({ length: stemCount }, (_, i) => {
      const f = i / (stemCount - 1);
      const size = (0.3 - 0.07 * f) * Math.cbrt(2 / stemCount);
      if (kind === "banana")
        return pose(-2.22 - f * 0.13, 3.04 + f * 0.3, 0, size, {
          scaleY: 1.15,
        });
      const body = kind === "papaya" ? papaya : apple;
      const surface = Math.max(
        ...body
          .filter(
            (p) => Math.abs(p.x) < spacing * 0.6 && Math.abs(p.z) < spacing,
          )
          .map((p) => p.y + p.scale / 2),
      );
      return pose(0.12 * f, surface + 0.12 + f * 0.3, 0, size, {
        scaleY: 1.15,
      });
    });
  const matchedPapaya = matchLayout(banana, papaya);
  const matchedApple = matchLayout(matchedPapaya, apple);
  return [
    [...banana, ...stems("banana")],
    [...matchedPapaya, ...stems("papaya")],
    [...matchedApple, ...stems("apple")],
  ];
}

/** Five authored volumes share the same body and stem identities for branching. */
export function fruitBranchLayouts(): SceneTransform[][] {
  const states = fruitLayouts(96);
  const spacing = 0.36;
  const orange = field(94, spacing, (x, y, z) => x * x + y * y + z * z);
  const watermelon = field(
    94,
    spacing,
    (x, y, z) => (x / 1.85) ** 2 + (y / 0.85) ** 2 + (z / 0.85) ** 2,
  );
  const matchedOrange = matchLayout(states[2].slice(0, 94), orange);
  const matchedWatermelon = matchLayout(matchedOrange, watermelon);
  const orangeTop = Math.max(...orange.map((part) => part.y + part.scale / 2));
  const melonLeft = Math.min(
    ...watermelon.map((part) => part.x - part.scale / 2),
  );
  return [
    ...states,
    [
      ...matchedOrange,
      pose(0, orangeTop + 0.08, 0, 0.2, { scaleY: 0.8 }),
      pose(0.18, orangeTop + 0.15, 0, 0.2, { scaleX: 1.8, scaleY: 0.5 }),
    ],
    [
      ...matchedWatermelon,
      pose(melonLeft - 0.12, 2.15, 0, 0.2, { scaleX: 1.3 }),
      pose(melonLeft - 0.28, 2.3, 0, 0.2, { scaleY: 1.4 }),
    ],
  ];
}
