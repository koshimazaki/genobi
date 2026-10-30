import type { Project } from "./types";
import { refuse } from "./layer-commands";

/** The preview and in-page export ceiling, shared with bundle validation. */
export const COMPOSITION_MAX_PIXELS = 1920 * 1080;
export interface Resolution {
  width: number;
  height: number;
}
export const COMPOSITION_RESOLUTIONS: readonly Resolution[] = [
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
export function readResolution(value: Record<string, unknown>): Resolution {
  const { width, height } = value;
  for (const n of [width, height])
    if (!Number.isInteger(n) || (n as number) < 16 || (n as number) > 4096)
      refuse("Resolution dimensions must be whole pixels from 16 to 4096");
  if ((width as number) * (height as number) > COMPOSITION_MAX_PIXELS)
    refuse("Composition resolution supports up to 1920 × 1080 pixels");
  return { width: width as number, height: height as number };
}

/** Fit the composition's ratio inside the largest video, capped for export.
 * Whole multiples of the reduced ratio keep both dimensions even for H.264.
 */
export function matchAssetResolution(
  composition: Resolution,
  videos: readonly Resolution[],
): Resolution {
  const largest = videos.reduce<Resolution | undefined>(
    (best, size) =>
      size.width > 0 &&
      size.height > 0 &&
      (!best || size.width * size.height > best.width * best.height)
        ? size
        : best,
    undefined,
  );
  if (!largest) return refuse("Match assets needs a readable video asset");
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(composition.width, composition.height);
  let w = composition.width / divisor,
    h = composition.height / divisor;
  if (w % 2 || h % 2) {
    w *= 2;
    h *= 2;
  }
  const units = Math.floor(
    Math.min(
      largest.width / w,
      largest.height / h,
      4096 / w,
      4096 / h,
      Math.sqrt(COMPOSITION_MAX_PIXELS / (w * h)),
    ),
  );
  return readResolution({ width: w * units, height: h * units });
}

/** Positions are composition pixels; scales are zoom ratios after contain
 * fitting. Keeping those ratios makes their rendered pixel sizes grow with
 * the frame already; multiplying them again would zoom the picture twice.
 * Locked layers participate because this changes the whole coordinate space.
 */
export function setResolution(project: Project, size: Resolution): Project {
  const resolution = readResolution({ ...size });
  const x = resolution.width / project.composition.width;
  const y = resolution.height / project.composition.height;
  return {
    ...project,
    composition: {
      ...project.composition,
      ...resolution,
      designSize: project.composition.designSize ?? {
        width: project.composition.width,
        height: project.composition.height,
      },
    },
    layers: project.layers.map((l) =>
      "position" in l
        ? {
            ...l,
            position: { x: l.position.x * x, y: l.position.y * y },
            ...(l.motion
              ? {
                  motion: {
                    ...l.motion,
                    xTo: l.motion.xTo * x,
                    yTo: l.motion.yTo * y,
                  },
                }
              : {}),
          }
        : l,
    ),
  };
}
