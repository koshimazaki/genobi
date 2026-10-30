import {
  CAMERA_VIEWS,
  DISPLAY_DIMENSIONS,
} from "../scene/akuspace/scene-layout.js";

type Point = readonly [number, number, number];
const dot = (a: Point, b: Point) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);
const normalize = (a: Point): Point => {
  const length = Math.hypot(...a);
  return a.map((value) => value / length) as unknown as Point;
};
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Project the actual room corners through the viewer's resting camera.
 * Preset-specific bounds preserve the visible small → club → medium size progression.
 */
export function roomGlyph(preset: string) {
  if (
    !["small_room", "medium_room", "empty_club", "cathedral"].includes(preset)
  )
    return null;
  const [width, depth, height] = DISPLAY_DIMENSIONS[preset];
  const { position, target } = CAMERA_VIEWS.standard;
  const forward = normalize(
    target.map((value, i) => value - position[i]) as unknown as Point,
  );
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const project = (point: Point) => {
    const relative = point.map(
      (value, i) => value - position[i],
    ) as unknown as Point;
    const distance = dot(relative, forward);
    return [dot(relative, right) / distance, -dot(relative, up) / distance];
  };
  const corners = [0, height].flatMap((y) =>
    [
      [-width / 2, y, -depth / 2],
      [width / 2, y, -depth / 2],
      [width / 2, y, depth / 2],
      [-width / 2, y, depth / 2],
    ].map((p) => project(p as unknown as Point)),
  );
  const minX = Math.min(...corners.map(([x]) => x));
  const maxX = Math.max(...corners.map(([x]) => x));
  const minY = Math.min(...corners.map(([, y]) => y));
  const maxY = Math.max(...corners.map(([, y]) => y));
  const bounds =
    preset === "small_room"
      ? [22, 20]
      : preset === "empty_club"
        ? [30, 27]
        : [38, 34];
  const scale = Math.min(bounds[0] / (maxX - minX), bounds[1] / (maxY - minY));
  const fit = ([x, y]: number[]) => [
    24 + (x - (minX + maxX) / 2) * scale,
    22 + (y - (minY + maxY) / 2) * scale,
  ];
  const points = corners.map(fit);
  const face = (indices: number[]) =>
    indices.map((i) => points[i].join(",")).join(" ");
  const edges = (pairs: number[][]) =>
    pairs
      .map(([a, b]) => `M${points[a].join(" ")}L${points[b].join(" ")}`)
      .join("");
  return {
    floor: face([0, 1, 2, 3]),
    left: face([3, 2, 6, 7]),
    right: face([1, 2, 6, 5]),
    backEdges: edges([
      [0, 1],
      [0, 3],
      [0, 4],
    ]),
    edges: edges([
      [1, 2],
      [2, 3],
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
    ]),
    source: fit(project([-width * 0.22, 0.34, -depth * 0.16])),
  };
}
