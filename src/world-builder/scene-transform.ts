import type { SceneTransform, SceneVector } from "./scene-state";

export const clampSceneValue = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, hi));
export const mixSceneValue = (a: number, b: number, t: number) =>
  a + (b - a) * t;
export function mixSceneVector(
  a: SceneVector,
  b: SceneVector,
  t: number,
): SceneVector {
  return [
    mixSceneValue(a[0], b[0], t),
    mixSceneValue(a[1], b[1], t),
    mixSceneValue(a[2], b[2], t),
  ];
}
const rotationKeys = ["rotation", "rotationX", "rotationZ"] as const;
const scaleKeys = ["scaleX", "scaleY", "scaleZ"] as const;
/** Euler axes follow their shortest signed angle; whole turns use twist controls. */
export function mixSceneTransform(
  a: SceneTransform,
  b: SceneTransform,
  t: number,
): SceneTransform {
  const result: SceneTransform = {
    x: mixSceneValue(a.x, b.x, t),
    y: mixSceneValue(a.y, b.y, t),
    z: mixSceneValue(a.z, b.z, t),
    scale: mixSceneValue(a.scale, b.scale, t),
  };
  for (const key of scaleKeys)
    result[key] = mixSceneValue(a[key] ?? 1, b[key] ?? 1, t);
  for (const key of rotationKeys) {
    const start = a[key] ?? 0;
    const delta = Math.atan2(
      Math.sin((b[key] ?? 0) - start),
      Math.cos((b[key] ?? 0) - start),
    );
    const angle = start + delta * t;
    // Interpolated poses can become authored keys; retain their valid angle range.
    result[key] =
      t === 1
        ? (b[key] ?? 0)
        : angle > Math.PI || angle < -Math.PI
          ? Math.atan2(Math.sin(angle), Math.cos(angle))
          : angle;
  }
  return result;
}

/** Local X followed by world Y, shared by position and orientation. */
export function twistPoint(
  point: SceneVector,
  x: number,
  y: number,
): SceneVector {
  const [px, py, pz] = point;
  const yy = py * Math.cos(x) - pz * Math.sin(x);
  const zz = py * Math.sin(x) + pz * Math.cos(x);
  return [
    px * Math.cos(y) + zz * Math.sin(y),
    yy,
    -px * Math.sin(y) + zz * Math.cos(y),
  ];
}

type Quaternion = [number, number, number, number];
function product(a: Quaternion, b: Quaternion): Quaternion {
  const [x, y, z, w] = a,
    [i, j, k, l] = b;
  return [
    w * i + x * l + y * k - z * j,
    w * j - x * k + y * l + z * i,
    w * k + x * j - y * i + z * l,
    w * l - x * i - y * j - z * k,
  ];
}
/** Compose twist in world space, then convert to Three.js's XYZ Euler order. */
export function twistRotation(
  p: SceneTransform,
  x: number,
  y: number,
): SceneVector {
  const a = (p.rotationX ?? 0) / 2,
    b = (p.rotation ?? 0) / 2,
    c = (p.rotationZ ?? 0) / 2;
  const local: Quaternion = [
    Math.sin(a) * Math.cos(b) * Math.cos(c) +
      Math.cos(a) * Math.sin(b) * Math.sin(c),
    Math.cos(a) * Math.sin(b) * Math.cos(c) -
      Math.sin(a) * Math.cos(b) * Math.sin(c),
    Math.cos(a) * Math.cos(b) * Math.sin(c) +
      Math.sin(a) * Math.sin(b) * Math.cos(c),
    Math.cos(a) * Math.cos(b) * Math.cos(c) -
      Math.sin(a) * Math.sin(b) * Math.sin(c),
  ];
  const [qx, qy, qz, qw] = product(
    product(
      [0, Math.sin(y / 2), 0, Math.cos(y / 2)],
      [Math.sin(x / 2), 0, 0, Math.cos(x / 2)],
    ),
    local,
  );
  const m13 = 2 * (qx * qz + qw * qy),
    m23 = 2 * (qy * qz - qw * qx),
    m33 = 1 - 2 * (qx * qx + qy * qy);
  const m12 = 2 * (qx * qy - qw * qz),
    m11 = 1 - 2 * (qy * qy + qz * qz);
  const m32 = 2 * (qy * qz + qw * qx),
    m22 = 1 - 2 * (qx * qx + qz * qz);
  return [
    Math.abs(m13) < 0.9999999 ? Math.atan2(-m23, m33) : Math.atan2(m32, m22),
    Math.asin(clampSceneValue(m13, -1, 1)),
    Math.abs(m13) < 0.9999999 ? Math.atan2(-m12, m11) : 0,
  ];
}
