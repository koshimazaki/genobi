import * as T from "three";
import { Capsule } from "three/addons/math/Capsule.js";
import { Octree } from "three/addons/math/Octree.js";
import { BUILDER_CHARACTER_MODELS } from "./character-catalog";
import { WORLD_POSITION_LIMIT } from "./scene-bounds";

/** Small capsule controller; static geometry only. No dynamic-physics simulation. */
export function createWalker(collider: Octree, start: T.Vector3) {
  const capsule = new Capsule(new T.Vector3(), new T.Vector3(), 0.22);
  const velocity = new T.Vector3(),
    delta = new T.Vector3(),
    position = new T.Vector3();
  let grounded = false;
  const reset = () => {
    capsule.start.copy(start).y += capsule.radius;
    capsule.end.copy(start).y +=
      BUILDER_CHARACTER_MODELS.mannequin.height - capsule.radius;
    velocity.set(0, 0, 0);
    grounded = false;
  };
  reset();
  return {
    get grounded() {
      return grounded;
    },
    jump() {
      if (!grounded) return false;
      velocity.y = 7;
      grounded = false;
      return true;
    },
    step(dt: number, direction: T.Vector3, running = false) {
      // Substeps keep narrow ramps solid, even after a slow preview frame.
      const step = Math.min(dt, 0.05) / 5;
      for (let i = 0; i < 5; i++) {
        grounded = false;
        velocity.x = direction.x * (running ? 6 : 3);
        velocity.z = direction.z * (running ? 6 : 3);
        velocity.y -= 18 * step;
        capsule.translate(delta.copy(velocity).multiplyScalar(step));
        for (let pass = 0; pass < 3; pass++) {
          const hit = collider.capsuleIntersect(capsule);
          if (!hit) break;
          if (hit.normal.y > 0.5 && velocity.y <= 0) grounded = true;
          capsule.translate(delta.copy(hit.normal).multiplyScalar(hit.depth));
          const inward = velocity.dot(hit.normal);
          if (inward < 0) velocity.addScaledVector(hit.normal, -inward);
        }
      }
      position.copy(capsule.start);
      position.y -= capsule.radius;
      if (
        Math.abs(position.y) > WORLD_POSITION_LIMIT ||
        Math.abs(position.x) > WORLD_POSITION_LIMIT ||
        Math.abs(position.z) > WORLD_POSITION_LIMIT
      ) {
        reset();
        position.copy(start);
      }
      return position;
    },
  };
}
