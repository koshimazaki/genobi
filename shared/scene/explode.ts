/**
 * A generic exploded view: parts move away from the assembly's centre, the
 * outermost first, so nothing passes through anything on the way out or back.
 *
 * The staggered timing follows elvarofficial/teardown (MIT), where each layer
 * of a machine starts its move a little after the one outside it. teardown
 * writes that per machine by hand; here any list of part positions works.
 * Pure and deterministic: the same parts and amount always give the same
 * offsets, so a captured frame matches the preview.
 */
import type { Vec3 } from "./types";

export interface ExplodeOptions {
  /** The point parts move away from. Defaults to the mean part position. */
  centre?: Vec3;
  /**
   * How far a part travels at amount 1, as a multiple of its distance from
   * the centre: 1 (the default) doubles every distance.
   */
  distance?: number;
  /** Restrict the move to one axis, e.g. [0, 1, 0] to lift layers apart. */
  axis?: Vec3;
  /** The share of the amount each part takes to travel, 0.1 to 1 (default 0.45). */
  window?: number;
}

export interface ExplodePlan {
  centre: Vec3;
  window: number;
  /** Per part, in input order: the full offset at amount 1 and when it starts. */
  parts: { reach: Vec3; start: number }[];
}

const smoother = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const finite = (v: Vec3) => v.every(Number.isFinite);

/** Work out where each part goes and when, once per set of positions. */
export function explodePlan(
  positions: readonly Vec3[],
  options: ExplodeOptions = {},
): ExplodePlan {
  const n = positions.length;
  if (!positions.every(finite))
    throw new Error("Explode positions must be finite.");
  const centre: Vec3 =
    options.centre ??
    (n
      ? ([0, 1, 2].map(
          (k) => positions.reduce((s, p) => s + p[k], 0) / n,
        ) as Vec3)
      : [0, 0, 0]);
  const distance = options.distance ?? 1;
  const window = options.window ?? 0.45;
  if (!finite(centre) || !Number.isFinite(distance) || distance < 0)
    throw new Error("Explode centre and distance must be finite.");
  if (!(window >= 0.1 && window <= 1))
    throw new Error("Explode window must be between 0.1 and 1.");
  let axis: Vec3 | undefined;
  if (options.axis) {
    const len = Math.hypot(...options.axis);
    if (!finite(options.axis) || len === 0)
      throw new Error("Explode axis must be a non-zero direction.");
    axis = options.axis.map((v) => v / len) as Vec3;
  }
  const reach = positions.map((p) => {
    const d = p.map((v, k) => v - centre[k]) as Vec3;
    const along = axis ? d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2] : 0;
    const moved = axis ? (axis.map((v) => v * along) as Vec3) : d;
    return moved.map((v) => v * distance) as Vec3;
  });
  // Outermost first: rank by how far each part travels, ties in input order.
  const order = reach
    .map((r, i) => ({ i, far: Math.hypot(...r) }))
    .sort((a, b) => b.far - a.far || a.i - b.i);
  const start = new Array<number>(n).fill(0);
  order.forEach(({ i }, rank) => {
    start[i] = n > 1 ? ((1 - window) * rank) / (n - 1) : 0;
  });
  return {
    centre,
    window,
    parts: reach.map((r, i) => ({ reach: r, start: start[i] })),
  };
}

/** One part's offset at an explode amount (0 assembled, 1 fully apart). */
export function explodeOffset(
  plan: ExplodePlan,
  index: number,
  amount: number,
): Vec3 {
  const part = plan.parts[index];
  if (!part || !Number.isFinite(amount)) return [0, 0, 0];
  const k = smoother((amount - part.start) / plan.window);
  // + 0 turns -0 into 0, so an assembled part reads as exactly [0, 0, 0].
  return part.reach.map((v) => v * k + 0) as Vec3;
}

/** Every part's offset at one amount, in input order. */
export function explodeOffsets(
  positions: readonly Vec3[],
  amount: number,
  options: ExplodeOptions = {},
): Vec3[] {
  const plan = explodePlan(positions, options);
  return plan.parts.map((_, i) => explodeOffset(plan, i, amount));
}
