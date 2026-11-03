import { Vector3 } from "three";

/** Clip in camera space so a wall crossing the eye plane does not disappear. */
export function clipProjectionFace(points: Vector3[], near = 0.05, far = 600) {
  const plane = (input: Vector3[], distance: number, front: boolean) => {
    const output: Vector3[] = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const insideA = front ? a.z <= -distance : a.z >= -distance;
      const insideB = front ? b.z <= -distance : b.z >= -distance;
      if (insideA) output.push(a);
      if (insideA !== insideB)
        output.push(a.clone().lerp(b, (-distance - a.z) / (b.z - a.z)));
    }
    return output;
  };
  return plane(plane(points, near, true), far, false);
}
