/** Metre-based authoring bounds shared by validation, evaluation and editing. */
export const WORLD_POSITION_LIMIT = 200;
export const CAMERA_POSITION_LIMIT = 400;
export const PRIMITIVE_SCALE_RANGE = [0.1, 32] as const;
export const PRIMITIVE_AXIS_RANGE = [0.1, 8] as const;
export const INSTANCE_SPACING_RANGE = [0.1, 12] as const;
export const SCENE_SIZE_FACTOR_RANGE = [0.25, 4] as const;

/** Keep a manipulated part's physical XYZ size when splitting uniform and axis scale. */
export function factorPrimitiveScale(
  size: readonly [number, number, number],
  preferredScale = 1,
) {
  if (size.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error("Primitive dimensions must be positive and finite.");
  const lo = Math.max(
    PRIMITIVE_SCALE_RANGE[0],
    Math.max(...size) / PRIMITIVE_AXIS_RANGE[1],
  );
  const hi = Math.min(
    PRIMITIVE_SCALE_RANGE[1],
    Math.min(...size) / PRIMITIVE_AXIS_RANGE[0],
  );
  const tolerance = 1e-10 * Math.max(1, lo, hi);
  if (lo > hi + tolerance)
    throw new Error(
      "These dimensions exceed the primitive scale or aspect-ratio limits.",
    );
  const scale = Math.max(
    PRIMITIVE_SCALE_RANGE[0],
    Math.min(
      PRIMITIVE_SCALE_RANGE[1],
      Math.max(
        lo,
        Math.min(Number.isFinite(preferredScale) ? preferredScale : 1, hi),
      ),
    ),
  );
  // Boundary ratios can differ by one floating-point unit after division.
  const axis = (value: number) =>
    Math.max(
      PRIMITIVE_AXIS_RANGE[0],
      Math.min(PRIMITIVE_AXIS_RANGE[1], value / scale),
    );
  return {
    scale,
    scaleX: axis(size[0]),
    scaleY: axis(size[1]),
    scaleZ: axis(size[2]),
  };
}

/** Bounds for editing one effective axis while preserving the other two. */
export function primitiveAxisSizeRange(size: readonly number[], axis: number) {
  const others = size.filter((_, index) => index !== axis);
  return {
    min:
      Math.max(
        PRIMITIVE_SCALE_RANGE[0],
        Math.max(...others) / PRIMITIVE_AXIS_RANGE[1],
      ) * PRIMITIVE_AXIS_RANGE[0],
    max:
      Math.min(
        PRIMITIVE_SCALE_RANGE[1],
        Math.min(...others) / PRIMITIVE_AXIS_RANGE[0],
      ) * PRIMITIVE_AXIS_RANGE[1],
  };
}
