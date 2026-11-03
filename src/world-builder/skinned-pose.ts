import { SkinnedMesh, type Object3D, type Skeleton } from "three";

/**
 * Publish the sampled pose before either RGB or depth collects render objects.
 * A preceding shadow pass can cache the next renderer frame's skeleton upload;
 * relying on that cache leaves a previous pose visible on some reverse seeks.
 */
export function refreshSkinnedPose(root: Object3D) {
  root.updateWorldMatrix(true, true);
  const updated = new Set<Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh) || updated.has(object.skeleton))
      return;
    object.skeleton.update();
    updated.add(object.skeleton);
  });
}
