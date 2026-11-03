import type { SceneTransform } from "./scene-state";
import { compactLayouts, pose } from "./motion-layout-utils";
import { brawlerLayout } from "./motion-brawler-layout";

/** The bike's parts are scaled from this base, on the presets' 0.72 voxel size. */
const BASE = 0.3,
  UNIT = BASE * 0.72;
/**
 * The bike is drawn at 2.7 x 0.7 x 0.9 m below, then scaled by this so it
 * reads beside the 4.6 m brawler: about 4.9 x 1.26 x 1.6 m.
 */
export const BIKE_SCALE = 1.8;
/** Half the body's drawn length, its nose at +z, toward a front camera. */
const HALF = 1.25;
/** Eight rows along the body, tail to nose, shared by the body slabs. */
const ROW = (2 * HALF) / 8;
const rowZ = (r: number) => -HALF + ROW / 2 + r * ROW;
/** Wheel centres and radii: a big rear wheel, a slightly smaller front. */
const FRONT = { z: 1.0, radius: 0.34, offset: 0.065, width: 0.13 },
  REAR = { z: -0.95, radius: 0.36, offset: 0.085, width: 0.17 };

export const BIKE_COLOURS = {
  body: "#c8262e",
  shadow: "#9b1b22",
  cream: "#efe6d2",
  tyre: "#1f1f24",
  metal: "#4a4f58",
  headlight: "#ffd36a",
  taillight: "#ff3b30",
} as const;

/** Top of the body at z: a low nose rising to the cowl, a tank, a dipped seat, a rising tail. */
export function bikeTopHeight(z: number) {
  if (z >= 0.5) return 0.78 - ((z - 0.5) / 0.75) * 0.36;
  if (z >= 0.1) return 0.7;
  if (z >= -0.5) return 0.55;
  return 0.55 + ((-0.5 - z) / 0.75) * 0.17;
}
/** Underside of the body at z: it rides over both wheels and drops to a belly pan between them. */
export function bikeBottomHeight(z: number) {
  if (z >= 0.65) return 0.38;
  if (z >= -0.6) return 0.2;
  return 0.45;
}
/** Half the body's width at z: the cowl is widest, the seat narrowest. */
export function bikeHalfWidth(z: number) {
  if (z >= 0.5) return 0.28;
  if (z >= 0.1) return 0.22;
  if (z >= -0.5) return 0.17;
  return 0.22;
}

/** A part sized in drawing metres: width (x), height (y) and length (z). */
function block(
  x: number,
  y: number,
  z: number,
  [w, h, l]: [number, number, number],
  color: string,
  extra: Partial<SceneTransform> = {},
) {
  const axis = (v: number) =>
    Math.round(((v * BIKE_SCALE) / UNIT) * 10000) / 10000;
  return pose(x * BIKE_SCALE, y * BIKE_SCALE, z * BIKE_SCALE, BASE, {
    scaleX: axis(w),
    scaleY: axis(h),
    scaleZ: axis(l),
    color,
    ...extra,
  });
}

/** Four slabs at 0, 45, 90 and 135 degrees make one half of a round wheel. */
function wheelSlab(side: number, k: number, wheel: typeof FRONT) {
  return block(
    side * wheel.offset,
    wheel.radius,
    wheel.z,
    [wheel.width, 2 * wheel.radius, 2 * wheel.radius * Math.tan(Math.PI / 8)],
    BIKE_COLOURS.tyre,
    { rotationX: (k * Math.PI) / 4 },
  );
}

/**
 * A long, low anime sports bike in the spacecraft's 128-part order, so each
 * bike part takes the mecha part the spacecraft part it replaces becomes: the
 * body slabs the torso, the cowl crown and windscreen the head, the side
 * fairings the arms, the wheels, forks and swingarm the legs (front wheel the
 * feet), the handlebars, pegs, tail fin and belly strakes the wings, the lights
 * the neck and hips. Drawn 2.7 m long, 0.7 m wide and 0.9 m tall and built at
 * BIKE_SCALE, the wheels on the floor at y = 0, the nose at +z.
 */
export function bikeLayout(): SceneTransform[] {
  const parts: SceneTransform[] = [];
  const C = BIKE_COLOURS;
  // Body slabs / torso: 4 across by 8 along, following the body profile.
  for (let y = 0; y < 4; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 4; x++) {
        const zc = rowZ(y * 2 + z);
        const top = bikeTopHeight(zc),
          bottom = bikeBottomHeight(zc),
          half = bikeHalfWidth(zc);
        const outer = x === 0 || x === 3;
        const height = (top - bottom) * (outer ? 0.7 : 1);
        parts.push(
          block(
            (x - 1.5) * (half / 2),
            top - height / 2,
            zc,
            [half / 2, height, ROW],
            outer ? C.shadow : C.body,
          ),
        );
      }
  // Cowl crown and windscreen / head: a raised ridge, then a raked screen.
  for (let y = 0; y < 2; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 3; x++)
        parts.push(
          y === 0
            ? block(
                (x - 1) * 0.16,
                bikeTopHeight(z ? 0.9 : 0.6) + 0.04,
                z ? 0.9 : 0.6,
                [0.16, 0.08, 0.3],
                C.body,
              )
            : block(
                (x - 1) * 0.15,
                z ? 0.88 : 0.8,
                z ? 0.32 : 0.42,
                [0.15, 0.03, 0.16],
                C.cream,
                { rotationX: 1.1 },
              ),
        );
  // Side fairings / arms: a panel and a vent at four stations between the wheels.
  const station = [-0.45, -0.05, 0.35, 0.75],
    bulge = [0.2, 0.22, 0.26, 0.32];
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const zc = station[row];
          const yc = bikeBottomHeight(zc) + 0.1 + z * 0.15;
          parts.push(
            x === 0
              ? block(side * bulge[row], yc, zc, [0.1, 0.15, 0.38], C.body)
              : block(
                  side * (bulge[row] + 0.07),
                  yc,
                  zc,
                  [0.06, 0.09, 0.22],
                  C.shadow,
                ),
          );
        }
  // Wheels, forks and swingarm / legs: front wheel, rear wheel, front, rear.
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const k = z * 2 + x;
          parts.push(
            row === 0
              ? wheelSlab(side, k, FRONT)
              : row === 1
                ? wheelSlab(side, k, REAR)
                : row === 2
                  ? [
                      // Fork leg from the cowl down to the front hub.
                      block(
                        side * 0.1,
                        0.52,
                        0.82,
                        [0.05, 0.42, 0.06],
                        C.metal,
                        { rotationX: 0.5 },
                      ),
                      // Front brake disc.
                      block(
                        side * 0.16,
                        FRONT.radius,
                        FRONT.z,
                        [0.02, 0.26, 0.26],
                        C.metal,
                        { rotationX: Math.PI / 4 },
                      ),
                      // Front mudguard, two plates over the wheel.
                      block(
                        side * 0.08,
                        0.72,
                        1.15,
                        [0.16, 0.04, 0.22],
                        C.body,
                        { rotationX: 0.7 },
                      ),
                      block(side * 0.08, 0.77, 0.98, [0.16, 0.04, 0.2], C.body),
                    ][k]
                  : [
                      // Swingarm from under the seat to the rear hub.
                      block(
                        side * 0.15,
                        0.3,
                        -0.62,
                        [0.05, 0.08, 0.6],
                        C.metal,
                      ),
                      // Exhaust can, low beside the rear wheel.
                      block(
                        side * 0.28,
                        0.24,
                        -0.5,
                        [0.11, 0.11, 0.55],
                        C.metal,
                      ),
                      // Rear hugger over the wheel, under the tail.
                      block(side * 0.1, 0.76, -1.0, [0.2, 0.04, 0.3], C.shadow),
                      // Rear brake disc.
                      block(
                        side * 0.19,
                        REAR.radius,
                        REAR.z,
                        [0.02, 0.26, 0.26],
                        C.metal,
                        { rotationX: Math.PI / 4 },
                      ),
                    ][k],
          );
        }
  // Handlebars, mirrors, pegs, tail fin and belly strakes / wings.
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        if (row) {
          const zc = -0.5 + col * 0.35;
          parts.push(
            block(
              side * (bikeHalfWidth(zc) + 0.01),
              bikeBottomHeight(zc) + 0.02,
              zc,
              [0.04, 0.06, 0.3],
              C.shadow,
            ),
          );
        } else
          parts.push(
            [
              block(side * 0.2, 0.78, 0.42, [0.26, 0.035, 0.035], C.metal),
              block(side * 0.34, 0.86, 0.46, [0.07, 0.05, 0.03], C.metal),
              block(side * 0.24, 0.28, -0.15, [0.12, 0.03, 0.05], C.metal),
              block(side * 0.12, 0.72, -1.28, [0.1, 0.1, 0.16], C.body, {
                rotationX: -0.5,
              }),
            ][col],
          );
      }
  // Lights / neck and hips: headlights at the nose, tail lights at the back.
  for (const side of [-1, 1])
    for (const top of [false, true])
      parts.push(
        top
          ? block(side * 0.1, 0.4, 1.27, [0.1, 0.07, 0.05], C.headlight)
          : block(side * 0.09, 0.66, -1.29, [0.07, 0.05, 0.05], C.taillight),
      );
  return parts;
}

/**
 * Bike and brawler mecha: two forms of the same 128 parts, each part carrying
 * its own colour. A third coloured form (the car) would push the preset past
 * the 64 KB recipe budget once a full soundtrack is attached, so the car stays
 * in its own car-mecha preset and joins the bike in the morph composer.
 */
export function bikeMechaLayouts(): SceneTransform[][] {
  return compactLayouts([bikeLayout(), brawlerLayout()]);
}
