import type { SceneTransform } from "./scene-state";
import { PRIMITIVE_SCALE_RANGE } from "./scene-bounds";

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

const axes = ["scaleX", "scaleY", "scaleZ"] as const;
function omitNeutral(part: SceneTransform): SceneTransform {
  return Object.fromEntries(
    Object.entries(part).filter(
      ([key, value]) =>
        value !== undefined &&
        !(key.startsWith("rotation") && value === 0) &&
        !(key === "presence" && value === 1) &&
        !(key !== "scale" && key.startsWith("scale") && value === 1),
    ),
  ) as SceneTransform;
}

/** Keep saved authored layouts compact without exceeding rotation bounds. */
export function compactLayouts(
  states: SceneTransform[][],
  roundValues = true,
): SceneTransform[][] {
  const compact = states.map((layout) =>
    layout.map((part) =>
      omitNeutral(
        Object.fromEntries(
          Object.entries(part).map(([key, value]) => [
            key,
            typeof value !== "number"
              ? value
              : key.startsWith("rotation")
                ? Math.max(
                    -Math.PI,
                    Math.min(Math.PI, roundValues ? rounded(value) : value),
                  )
                : roundValues
                  ? rounded(value)
                  : value,
          ]),
        ) as SceneTransform,
      ),
    ),
  );
  // A constant factor across every key preserves interpolation of scale and
  // axes. Keep it only when effective XYZ sizes are bit-identical, all bounds
  // still hold, and the complete serialized track becomes shorter.
  for (let index = 0; index < (compact[0]?.length ?? 0); index++) {
    const original = compact.map((layout) => layout[index]);
    if (original.some((part) => !part)) continue;
    let best = original;
    let bytes = JSON.stringify(best).length;
    for (const factor of new Set(axes.map((axis) => original[0][axis] ?? 1))) {
      if (
        factor === 1 ||
        !axes.some((axis) => original.every((p) => (p[axis] ?? 1) === factor))
      )
        continue;
      const candidate = original.map((part) =>
        omitNeutral({
          ...part,
          scale: part.scale * factor,
          ...Object.fromEntries(
            axes.map((axis) => [axis, (part[axis] ?? 1) / factor]),
          ),
        }),
      );
      if (
        !candidate.every(
          (part, state) =>
            part.scale >= 0.1 &&
            part.scale <= PRIMITIVE_SCALE_RANGE[1] &&
            axes.every(
              (axis) =>
                (part[axis] ?? 1) >= 0.1 &&
                (part[axis] ?? 1) <= 8 &&
                part.scale * (part[axis] ?? 1) ===
                  original[state].scale * (original[state][axis] ?? 1),
            ),
        )
      )
        continue;
      const length = JSON.stringify(candidate).length;
      if (length < bytes) {
        best = candidate;
        bytes = length;
      }
    }
    best.forEach((part, state) => {
      compact[state][index] = part;
    });
  }
  return compact;
}

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
