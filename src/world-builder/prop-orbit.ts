import { loopedSpin } from "./loop";

/**
 * A primitive's constant orbit: `orbit` radians per second around a vertical
 * axis through (`orbitX`, `orbitZ`), the scene centre unless given. The angle
 * is a function of the frame alone, as spin is, so a capture replays it
 * exactly; in a seamless loop it rounds to whole turns, as spin does.
 * Positive is counter-clockwise seen from above.
 */
export const ORBIT_RANGE = { min: -1, max: 1 } as const;

export interface Orbiting {
  x: number;
  z: number;
  orbit?: number;
  orbitX?: number;
  orbitZ?: number;
}

/** The prop's x and z at `seconds` into the take (`period` set when looping). */
export function orbitPosition(
  p: Orbiting,
  seconds: number,
  period?: number,
): [number, number] {
  const rate = p.orbit ?? 0;
  if (!rate) return [p.x, p.z];
  const angle = (period ? loopedSpin(rate, period) : rate) * seconds;
  const cx = p.orbitX ?? 0,
    cz = p.orbitZ ?? 0,
    dx = p.x - cx,
    dz = p.z - cz,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  // A rotation about +Y, the same sense as a positive spin.
  return [cx + dx * cos + dz * sin, cz - dx * sin + dz * cos];
}
