/**
 * Sound absorption coefficients per octave band, 125 Hz to 4 kHz: the values
 * commonly reproduced from the textbook tables (Everest, Master Handbook of
 * Acoustics; Kinsler et al., Fundamentals of Acoustics; tabulated by
 * HyperPhysics, "Sound absorption coefficients"): marble or glazed tile, a
 * concrete or terrazzo floor, smooth plaster on brick, 3/8" plywood panelling,
 * heavy carpet on foam rubber, heavy velour (18 oz/yd²) draped to half area,
 * and large panes of heavy plate glass. Metal panel is the steel row of the
 * Engineering ToolBox table. Published values vary by mounting and source,
 * and these were transcribed, not re-measured; treat a result as an estimate.
 */
import type { SceneMaterial } from "./types";

export const OCTAVE_BANDS = [125, 250, 500, 1000, 2000, 4000] as const;
export type OctaveBand = (typeof OCTAVE_BANDS)[number];
type Bands = readonly [number, number, number, number, number, number];

export const ABSORPTION: Record<SceneMaterial, Bands> = {
  tile: [0.01, 0.01, 0.01, 0.01, 0.02, 0.02],
  concrete: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02],
  plaster: [0.013, 0.015, 0.02, 0.03, 0.04, 0.05],
  wood: [0.28, 0.22, 0.17, 0.09, 0.1, 0.11],
  carpet: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73],
  curtain: [0.14, 0.35, 0.55, 0.72, 0.7, 0.65],
  glass: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02],
  metal: [0.05, 0.1, 0.1, 0.1, 0.07, 0.02],
};

/** A door, an open top or a missing wall lets all the sound out. */
export const OPENING: Bands = [1, 1, 1, 1, 1, 1];

/**
 * Air attenuation m (nepers per metre, intensity) at 20 °C and 50 % relative
 * humidity, from ISO 9613-1's 9.86 and 32.8 dB/km at 2 and 4 kHz
 * (m = dB/km ÷ 4343). Below 2 kHz it is too small to matter in a room.
 */
export const AIR: Record<OctaveBand, number> = {
  125: 0,
  250: 0,
  500: 0,
  1000: 0,
  2000: 0.00227,
  4000: 0.00755,
};
/** Air absorption counts only in large rooms. */
export const AIR_VOLUME = 500;
export const SPEED_OF_SOUND = 343;
