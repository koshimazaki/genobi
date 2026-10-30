/**
 * Camera ease curves, ported from Holodeck's `camera/camera-combo.ts`
 * (MIT, Copyright (c) 2025 Glitch Candies Studio; notice retained in
 * `src/world-builder/Holodeck-LICENSE.txt`). Pure functions only: the
 * Three.js layer types and helpers of the original stay in Holodeck.
 */
export const CAMERA_EASES = [
  "linear",
  "smoothstep",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "sineInOut",
] as const;

export type CameraEaseKey = (typeof CAMERA_EASES)[number];

/** Holodeck's picker order and labels. */
export const CAMERA_EASE_PRESETS: readonly {
  key: CameraEaseKey;
  label: string;
}[] = [
  { key: "easeInOutCubic", label: "Cubic S" },
  { key: "smoothstep", label: "Smooth" },
  { key: "sineInOut", label: "Sine" },
  { key: "easeOutCubic", label: "Ease out" },
  { key: "easeInCubic", label: "Ease in" },
  { key: "linear", label: "Linear" },
];

export const isCameraEase = (value: unknown): value is CameraEaseKey =>
  typeof value === "string" &&
  (CAMERA_EASES as readonly string[]).includes(value);

/** Clamp to 0..1; NaN reads as 0, as in Holodeck. */
export function clamp01(value: number): number {
  return Math.min(Math.max(value || 0, 0), 1);
}

/** Eased progress for 0..1 input. Every curve maps 0 to 0 and 1 to 1. */
export function applyCameraEase(key: CameraEaseKey, value: number): number {
  const t = clamp01(value);
  switch (key) {
    case "linear":
      return t;
    case "smoothstep":
      return t * t * (3 - 2 * t);
    case "easeInCubic":
      return t * t * t;
    case "easeOutCubic":
      return 1 - Math.pow(1 - t, 3);
    case "sineInOut":
      return -(Math.cos(Math.PI * t) - 1) / 2;
    case "easeInOutCubic":
    default:
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}
