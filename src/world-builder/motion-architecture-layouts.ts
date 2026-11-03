import type { SceneTransform } from "./scene-state";
import { compactLayouts, matchLayout, pose } from "./motion-layout-utils";

export type ArchitectureDetail = 64 | 128 | 256;

const centers = (count: number) =>
  Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 2);

/** Touching blocks form actual walls and roofs, with deliberate openings. */
function masonry() {
  const cells = new Map<string, SceneTransform>();
  const add = (x: number, y: number, z: number, scale = 2) => {
    cells.set(`${x}/${y}/${z}/${scale}`, pose(x, y, z, scale));
  };
  const slab = (width: number, depth: number, y: number) => {
    for (const z of centers(depth))
      for (const x of centers(width)) add(x, y, z);
  };
  const shell = (
    width: number,
    depth: number,
    height: number,
    opening: (x: number, y: number, z: number) => boolean,
  ) => {
    for (let level = 0; level < height; level++)
      for (const z of centers(depth))
        for (const x of centers(width)) {
          const y = level * 2;
          const horizontal = level === 0 || level === height - 1;
          const wall = Math.abs(x) === width - 1 || Math.abs(z) === depth - 1;
          if (horizontal || (wall && !opening(x, y, z))) add(x, y, z);
        }
  };
  return { add, slab, shell, parts: () => [...cells.values()] };
}

function pyramid(count: ArchitectureDetail) {
  const widths = {
    64: [5, 5, 3, 2, 1],
    128: [7, 6, 5, 3, 2, 2, 1],
    256: [9, 8, 7, 6, 4, 3, 1],
  }[count];
  const building = masonry();
  widths.forEach((width, level) => building.slab(width, width, level * 2));
  return building.parts();
}

function house(count: ArchitectureDetail) {
  const building = masonry();
  const { add, slab, shell } = building;
  if (count === 64) {
    shell(
      4,
      4,
      4,
      (x, y, z) =>
        (z === 3 && Math.abs(x) === 1) ||
        (Math.abs(x) === 3 && y === 4 && z === -1),
    );
    slab(2, 4, 8);
    slab(1, 4, 10);
    for (const y of [8, 10]) add(3, y, -1);
  } else if (count === 128) {
    shell(
      5,
      6,
      4,
      (x, y, z) =>
        (z === 5 && x === 0) ||
        (Math.abs(x) === 4 && y === 4 && Math.abs(z) === 3) ||
        (z === -5 && x === 0 && y === 4),
    );
    slab(3, 6, 8);
    slab(1, 6, 10);
    for (const y of [8, 10, 12]) add(4, y, -3);
    // A covered entrance, columns and a wider first step.
    for (const x of [-2, 0, 2]) {
      add(x, 0, 7);
      add(x, 6, 7);
    }
    for (const x of [-2, 2]) for (const y of [2, 4]) add(x, y, 7);
    for (const x of [-1, 1]) add(x, 0, 9);
  } else {
    shell(
      7,
      7,
      4,
      (x, y, z) =>
        (z === 6 && x === 0) ||
        (z === 6 && Math.abs(x) === 4 && y === 4) ||
        (Math.abs(x) === 6 && Math.abs(z) === 2 && y === 4) ||
        (z === -6 && Math.abs(x) === 2 && y === 4),
    );
    for (const [width, y] of [
      [5, 8],
      [3, 10],
      [1, 12],
    ])
      slab(width, 7, y);
    for (const y of [8, 10, 12]) add(6, y, -2);
    for (const z of [8, 10])
      for (const x of [-4, -2, 0, 2, 4]) {
        add(x, 0, z);
        add(x, 6, z);
      }
    for (const x of [-4, 4]) for (const y of [2, 4]) add(x, y, 10);
    // A closed side chamber, including its own floor and pitched roof.
    for (const x of [8, 10, 12])
      for (const z of [-2, 0, 2])
        for (const y of [0, 2, 4]) {
          if (x === 10 && y === 2 && (z === 0 || z === 2)) continue;
          if (x === 12 && y === 2 && z === 0) continue;
          add(x, y, z);
        }
    for (const z of [-2, 0, 2]) add(10, 6, z);
    for (const x of [-2, 0, 2]) add(x, 0, 12);
  }
  return building
    .parts()
    .map((part) =>
      count === 256 ? { ...part, x: part.x - 3, z: part.z - 3 } : part,
    );
}

function cathedral(count: ArchitectureDetail) {
  const building = masonry();
  const { add, slab, shell } = building;
  if (count === 64) {
    shell(
      3,
      5,
      4,
      (x, y, z) =>
        (z === 4 && x === 0) || (Math.abs(x) === 2 && z === 0 && y === 4),
    );
    slab(1, 5, 8);
    for (const x of [-2, 2]) {
      for (const y of [8, 10, 12]) add(x, y, 4);
      add(x, 13.5, 4, 1);
    }
    add(0, 10, 4);
  } else if (count === 128) {
    shell(
      4,
      6,
      4,
      (x, y, z) =>
        (z === 5 && Math.abs(x) === 1) ||
        (Math.abs(x) === 3 && Math.abs(z) === 1 && y === 4) ||
        (z === -5 && Math.abs(x) === 1 && y === 4),
    );
    slab(2, 6, 8);
    slab(1, 6, 10);
    for (const x of [-3, 3]) {
      for (const z of [3, 5]) for (const y of [8, 10, 12]) add(x, y, z);
      add(x, 14, 4);
    }
    for (const x of [-5, 5])
      for (const z of [-3, 3]) for (const y of [0, 2, 4, 6]) add(x, y, z);
    for (const x of [-1, 1]) {
      add(x, 0, 7);
      add(x, 6, 7);
    }
  } else {
    shell(
      5,
      9,
      5,
      (x, y, z) =>
        (z === 8 && x === 0 && y <= 4) ||
        (z === 8 && Math.abs(x) === 2 && y === 6) ||
        (Math.abs(x) === 4 && [-4, 0, 4].includes(z) && y >= 4) ||
        (z === -8 && x === 0 && y >= 4),
    );
    slab(3, 9, 10);
    slab(1, 9, 12);
    for (const side of [-1, 1]) {
      for (const x of [2 * side, 4 * side])
        for (const z of [6, 8]) for (const y of [10, 12, 14, 16]) add(x, y, z);
      add(3 * side, 18, 7);
      add(3 * side, 19.5, 7, 1);
    }
    for (const x of [-6, 6])
      for (const z of [-6, -2, 2, 6])
        for (const y of [0, 2, 4, 6, 8]) add(x, y, z);
    for (const x of [-3, -1, 1, 3]) add(x, 0, 10);
  }
  return finishMasonry(building.parts(), count).map((part) =>
    count === 64 ? part : { ...part, z: part.z - 1 },
  );
}

/** Split a few roof blocks, preserving a sealed surface and exact silhouette. */
function finishMasonry(parts: SceneTransform[], count: ArchitectureDetail) {
  if (parts.length > count)
    throw new Error("Architecture exceeds its detail budget.");
  const splits = count - parts.length;
  const candidates = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => part.scale === 2)
    .sort((a, b) => b.part.y - a.part.y || a.index - b.index)
    .slice(0, splits);
  const selected = new Set(candidates.map(({ index }) => index));
  return parts.flatMap((part, index) =>
    selected.has(index)
      ? [-0.5, 0.5].map((offset) => ({
          ...part,
          x: part.x + offset,
          scaleX: 0.5,
        }))
      : [part],
  );
}

/** Three original closed architectural forms; every part keeps its identity. */
export function architectureLayouts(
  count: ArchitectureDetail,
): SceneTransform[][] {
  if (![64, 128, 256].includes(count))
    throw new Error("Architecture detail must be 64, 128 or 256.");
  const first = pyramid(count);
  const second = matchLayout(first, house(count));
  return compactLayouts([first, second, matchLayout(second, cathedral(count))]);
}
