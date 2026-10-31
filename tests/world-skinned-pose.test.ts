import { describe, expect, it, vi } from "vitest";
import {
  Bone,
  BufferGeometry,
  Group,
  Matrix4,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
} from "three";
import { refreshSkinnedPose } from "../src/world-builder/skinned-pose";

describe("sampled character skinning", () => {
  it("publishes the current world pose and bone texture even when the renderer would reuse an upload", () => {
    const parent = new Group(),
      rig = new Group(),
      bone = new Bone();
    parent.add(rig);
    rig.add(bone);
    const skeleton = new Skeleton([bone]);
    const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
    const other = new SkinnedMesh(mesh.geometry, mesh.material);
    rig.add(mesh, other);
    parent.updateMatrixWorld(true);
    mesh.bind(skeleton);
    other.bind(skeleton);
    skeleton.computeBoneTexture();
    const uploaded = Array.from(skeleton.boneMatrices);
    const version = skeleton.boneTexture!.version;
    const update = vi.spyOn(skeleton, "update");
    parent.position.y = 40;
    bone.rotation.z = 0.7;
    bone.position.x = 2;
    // Sampling changes bones, but the previously uploaded skin buffer is stale.
    expect(Array.from(skeleton.boneMatrices)).toEqual(uploaded);
    refreshSkinnedPose(rig);
    const expected = new Matrix4().multiplyMatrices(
      bone.matrixWorld,
      skeleton.boneInverses[0],
    );
    expected.elements.forEach((value, index) =>
      expect(skeleton.boneMatrices[index]).toBeCloseTo(value, 5),
    );
    expect(skeleton.boneTexture!.version).toBeGreaterThan(version);
    expect(update).toHaveBeenCalledTimes(1);
    const first = Array.from(skeleton.boneMatrices);
    parent.position.y = 4;
    bone.rotation.z = -0.4;
    refreshSkinnedPose(rig);
    parent.position.y = 40;
    bone.rotation.z = 0.7;
    refreshSkinnedPose(rig);
    expect(Array.from(skeleton.boneMatrices)).toEqual(first);
    mesh.geometry.dispose();
    mesh.material.dispose();
    skeleton.dispose();
  });
});
