export interface PickedKeyframe {
  role: "first" | "closed" | "open";
  /** The guide frame, snapped to the latent grid. */
  index: number;
  /** The raw band extreme before snapping. */
  source: number;
  smoothed: number;
}
export declare function smoothSeries(
  values: number[],
  window?: number,
): number[];
export declare function pickKeyframes(
  series: number[],
  options?: { window?: number; settle?: number; stride?: number },
): PickedKeyframe[];
export declare const LATENT_STRIDE: number;
export declare function snapToGrid(
  index: number,
  frames: number,
  stride?: number,
): number;
export declare function keyframeFile(role: string, index: number): string;
