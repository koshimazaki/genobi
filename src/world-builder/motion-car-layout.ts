import type { SceneTransform } from "./scene-state";
import { compactLayouts, pose } from "./motion-layout-utils";
import { spacecraftStates } from "./motion-object-layouts";

/** The car's parts are scaled from this base, on the presets' 0.72 voxel size. */
const BASE = 0.3,
  UNIT = BASE * 0.72;
/** Half the car's length (2.2 m), its nose at +z, toward a front camera. */
const HALF = 1.1;
/** Eight rows along the car, rear to nose, shared by the deck and side panels. */
const ROW = (2 * HALF) / 8;
const rowZ = (r: number) => -HALF + ROW / 2 + r * ROW;
/** The hood drops 0.24 m over 0.95 m to the nose. */
const HOOD = Math.atan(0.24 / 0.95);

/** Top of the body at z: a sloped nose, a flat cabin deck, a flat rear deck. */
export function carDeckHeight(z: number) {
  if (z >= 0.15) return 0.24 + ((HALF - z) / 0.95) * 0.24;
  return z >= -0.75 ? 0.48 : 0.5;
}

/** A part sized in metres: width (x), height (y) and length (z). */
function block(
  x: number,
  y: number,
  z: number,
  [w, h, l]: [number, number, number],
  extra: Partial<SceneTransform> = {},
) {
  return pose(x, y, z, BASE, {
    scaleX: Math.round((w / UNIT) * 10000) / 10000,
    scaleY: Math.round((h / UNIT) * 10000) / 10000,
    scaleZ: Math.round((l / UNIT) * 10000) / 10000,
    ...extra,
  });
}

/**
 * A low wedge car in the spacecraft's 128-part order, so each car part
 * takes the mecha part the spacecraft part it replaces becomes: the body deck
 * the torso, the cabin the head, the side panels the arms, the wheels and
 * bumpers the legs (front wheel the feet), the spoiler and flares the wings,
 * the lights the neck and hips. About 2.2 m long, 1.0 m wide and 0.7 m tall,
 * the wheels on the floor at y = 0 and the nose at +z.
 */
export function carLayout(): SceneTransform[] {
  const parts: SceneTransform[] = [];
  // Body deck / torso: 4 across by 8 along, the hood rows sloped to the nose.
  for (let y = 0; y < 4; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 4; x++) {
        const zc = rowZ(y * 2 + z);
        const hood = zc >= 0.15;
        parts.push(
          block(
            (x - 1.5) * 0.22,
            carDeckHeight(zc) - 0.05,
            zc,
            [0.22, 0.1, hood ? ROW / Math.cos(HOOD) : ROW],
            hood ? { rotationX: HOOD } : {},
          ),
        );
      }
  // Cabin / head: a two-tier canopy two thirds back, the windscreen raked.
  for (let y = 0; y < 2; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 3; x++)
        parts.push(
          y === 0
            ? block(
                (x - 1) * 0.26,
                0.54,
                z ? -0.05 : -0.5,
                [0.26, 0.12, z ? 0.42 : 0.5],
                z ? { rotationX: 0.3 } : {},
              )
            : block((x - 1) * 0.2, 0.65, z ? -0.2 : -0.5, [0.2, 0.1, 0.3]),
        );
  // Side panels / arms: two levels under the deck along each flank.
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const zc = rowZ(row * 2 + x);
          const level = (carDeckHeight(zc) - 0.1 - 0.08) / 2;
          parts.push(
            block(side * 0.42, 0.08 + level * (z + 0.5), zc, [
              0.08,
              level,
              ROW,
            ]),
          );
        }
  // Wheels and bumpers / legs: front wheel, rear wheel, nose, flat rear.
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const across = side * (0.11 + x * 0.22);
          parts.push(
            row < 2
              ? block(
                  side * 0.42,
                  0.085 + z * 0.17,
                  (row ? -0.7 : 0.68) + (x - 0.5) * 0.17,
                  [0.16, 0.17, 0.17],
                )
              : row === 2
                ? z
                  ? block(across, 0.15, 1.02, [0.22, 0.12, 0.14])
                  : block(across, 0.06, 1.05, [0.22, 0.05, 0.12])
                : z
                  ? block(across, 0.32, -1.07, [0.22, 0.24, 0.06])
                  : block(across, 0.12, -1.05, [0.22, 0.12, 0.1]),
          );
        }
  // Spoiler, struts, flares and intakes / wings.
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++)
        parts.push(
          row
            ? block(
                side * (0.0625 + col * 0.125),
                0.68,
                -1,
                [0.125, 0.04, 0.16],
              )
            : [
                block(side * 0.3, 0.59, -1, [0.04, 0.14, 0.06]),
                block(side * 0.44, 0.44, -0.65, [0.1, 0.12, 0.4]),
                block(side * 0.44, 0.38, 0.68, [0.1, 0.08, 0.4]),
                block(side * 0.47, 0.28, -0.2, [0.06, 0.1, 0.3]),
              ][col],
        );
  // Lights / neck and hips: tail lights low, headlight bars high.
  for (const side of [-1, 1])
    for (const top of [false, true])
      parts.push(
        top
          ? block(side * 0.3, 0.26, 1.04, [0.26, 0.04, 0.06])
          : block(side * 0.3, 0.42, -1.1, [0.3, 0.05, 0.04]),
      );
  return parts;
}

/** Car, mecha and winged mecha: the spacecraft preset's robot, a car at rest. */
export function carMechaLayouts(): SceneTransform[][] {
  const [, mecha, winged] = spacecraftStates();
  return compactLayouts([carLayout(), mecha, winged]);
}
