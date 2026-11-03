import type { SceneTransform } from "./scene-state";
import { rounded } from "./motion-layout-utils";

export type StoryRole = "structure" | "tower" | "taxi" | "trim";
export interface StoryPart extends SceneTransform {
  role: StoryRole;
  /** All tower parts squash around this world-space footing. */
  footing?: number;
  /** Facade details widen about their own building, then the building moves. */
  towerX?: number;
}
export const STORY_PALETTE = [
  "#41536a",
  "#5a6c80",
  "#aabcc2",
  "#d4c5a2",
  "#72bfc3",
  "#b288ac",
  "#edca62",
  "#d3d8cf",
];

/** Box geometry is one metre on every axis before this explicit transform. */
export function storyBox(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  role: StoryRole = "structure",
  extra: Partial<StoryPart> = {},
): StoryPart {
  // Reserve the tower's lateral squash in the same factorization at every key.
  // Changing the common factor between keys would curve the effective XYZ size.
  const scale = Math.max(
    0.1,
    Math.max(width * (role === "tower" ? 1.12 : 1), height, depth) / 8,
  );
  return {
    x,
    y,
    z,
    scale: rounded(scale),
    scaleX: rounded(width / scale),
    scaleY: rounded(height / scale),
    scaleZ: rounded(depth / scale),
    role,
    ...extra,
  };
}

/** Four slabs retain an actual rectangular opening in the horizontal plane. */
export function storyFloor(
  floor: number,
  width: number,
  depth: number,
  holeWidth: number,
  holeDepth: number,
  thickness = 0.8,
): StoryPart[] {
  return [
    ...[-1, 1].map((side) =>
      storyBox(
        (side * (width + holeWidth)) / 4,
        floor - thickness / 2,
        0,
        (width - holeWidth) / 2,
        thickness,
        depth,
      ),
    ),
    ...[-1, 1].map((side) =>
      storyBox(
        0,
        floor - thickness / 2,
        (side * (depth + holeDepth)) / 4,
        holeWidth,
        thickness,
        (depth - holeDepth) / 2,
      ),
    ),
  ];
}

export function storyTaxi(x: number, floor: number, z: number): StoryPart[] {
  return [
    storyBox(x, floor + 0.65, z, 1.9, 0.75, 4.4, "taxi", {
      color: "#edca62",
    }),
    storyBox(x, floor + 1.25, z - 0.1, 1.6, 0.55, 2.2, "taxi", {
      color: "#76aab7",
    }),
    storyBox(x, floor + 1.65, z - 0.1, 0.7, 0.25, 0.4, "taxi", {
      color: "#fff0ac",
    }),
    ...[-0.9, 0.9].map((side) =>
      storyBox(x + side, floor + 0.25, z, 0.2, 0.4, 3.25, "taxi", {
        color: "#17202c",
      }),
    ),
  ];
}

/** Eight distinct tower silhouettes around a clear central street. */
export function storyStreet(floor: number): StoryPart[] {
  const parts: StoryPart[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index++) {
      const height = [38, 54, 72, 46][index] + (side > 0 ? 6 : 0),
        x = side * (index % 2 ? 20 : 21.5),
        z = -24 + index * 16,
        width = index % 2 ? 10 : 12;
      parts.push(
        storyBox(x, floor + height / 2, z, width, height, 12, "tower", {
          footing: floor,
          towerX: x,
        }),
        storyBox(x, floor + height + 0.8, z, width * 0.65, 1.6, 8, "tower", {
          footing: floor,
          towerX: x,
        }),
        storyBox(
          x - side * (width / 2 + 0.06),
          floor + height * 0.55,
          z,
          0.8,
          height * 0.72,
          1.8,
          "tower",
          {
            footing: floor,
            towerX: x,
            color: index % 2 ? "#72bfc3" : "#d4c5a2",
          },
        ),
      );
    }
  }
  parts.push(...storyTaxi(-4.8, floor, -15), ...storyTaxi(4.8, floor, 17));
  for (const side of [-1, 1])
    parts.push(
      storyBox(side * 9, floor + 2.8, 7, 0.6, 5.6, 0.6, "trim"),
      storyBox(side * 8.1, floor + 5.4, 7, 2.4, 0.4, 0.9, "trim", {
        color: "#fff0ac",
      }),
    );
  return parts;
}

/** Rest, a grounded bass squash, and a lane shuffle retain every part ID. */
export function storyPoses(parts: StoryPart[]): SceneTransform[][] {
  return ["rest", "squeeze", "shuffle"].map((pose) =>
    parts.map(({ role, footing, towerX, ...part }) => {
      if (pose === "squeeze" && role === "tower")
        return {
          ...part,
          x: rounded(towerX! * 0.9 + (part.x - towerX!) * 1.12),
          y: rounded(footing! + (part.y - footing!) * 0.82),
          scaleX: rounded((part.scaleX ?? 1) * 1.12),
          scaleY: rounded((part.scaleY ?? 1) * 0.82),
        };
      if (pose === "shuffle" && role === "taxi")
        return {
          ...part,
          x: rounded(part.x + (part.x < 0 ? 1.4 : -1.4)),
          z: rounded(part.z + (part.x < 0 ? 2 : -2)),
        };
      return part;
    }),
  );
}
