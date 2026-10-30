import * as T from "three";
import {
  VRMSpringBoneCollider,
  VRMSpringBoneJoint,
  VRMSpringBoneManager,
  type VRM,
} from "@pixiv/three-vrm";

// SkeletonUtils cannot construct a collider without its shape. Keep its authored
// attachment separately, then rebuild colliders and joints for each actor.
const parents = new WeakMap<T.Object3D, T.Object3D>();
export function detachSpringColliders(vrm: VRM) {
  for (const collider of vrm.springBoneManager?.colliders ?? []) {
    if (collider.parent) parents.set(collider, collider.parent);
    collider.removeFromParent();
  }
}
export function cloneSprings(vrm: VRM, mapping: Map<T.Object3D, T.Object3D>) {
  const springs = new VRMSpringBoneManager();
  const colliderMap = new Map<VRMSpringBoneCollider, VRMSpringBoneCollider>();
  const map = (node: T.Object3D) => {
    const copy = mapping.get(node);
    if (!copy) throw new Error(`Missing spring bone ${node.name}.`);
    return copy;
  };
  for (const source of vrm.springBoneManager?.colliders ?? []) {
    // Shapes contain authored geometry only; each collider owns its world matrix.
    const copy = new VRMSpringBoneCollider(source.shape);
    copy.position.copy(source.position);
    copy.quaternion.copy(source.quaternion);
    copy.scale.copy(source.scale);
    const parent = parents.get(source) ?? source.parent;
    if (parent) map(parent).add(copy);
    colliderMap.set(source, copy);
  }
  for (const source of vrm.springBoneManager?.joints ?? []) {
    const joint = new VRMSpringBoneJoint(
      map(source.bone),
      source.child ? map(source.child) : null,
      { ...source.settings, gravityDir: source.settings.gravityDir.clone() },
      source.colliderGroups.map((group) => ({
        name: group.name,
        colliders: group.colliders.map((c) => colliderMap.get(c)!),
      })),
    );
    joint.center = source.center ? map(source.center) : null;
    springs.addJoint(joint);
  }
  return springs;
}

/** Fixed 60 Hz integration also makes backwards seeking repeatable. */
export function springSampler(
  model: T.Object3D,
  springs: VRMSpringBoneManager,
  pose: (time: number) => void,
) {
  let step = -1;
  function reset() {
    pose(0);
    model.updateWorldMatrix(true, true);
    springs.reset();
    step = 0;
  }
  model.updateWorldMatrix(true, true);
  springs.setInitState();
  return {
    reset: () => {
      step = -1;
    },
    sample(seconds: number) {
      const target = Math.floor(seconds * 60 + 1e-7);
      if (step < 0 || target < step || seconds === 0) reset();
      while (step < target) {
        pose(++step / 60);
        model.updateWorldMatrix(true, true);
        springs.update(1 / 60);
      }
      pose(seconds);
    },
  };
}
