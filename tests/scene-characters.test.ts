import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { exampleScene } from "../shared/scene/examples";
import { CHARACTER_CLIPS, characterGroup } from "../src/scene3d/characters";
import { disposeGroup } from "../src/scene3d/build-scene";

it("uses the real bundled mannequin, with independent skeletons and deterministic poses", async () => {
  const bytes = await readFile("public/world-assets/AnimationLibrary.glb");
  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  for (const name of Object.values(CHARACTER_CLIPS))
    expect(asset.animations.some((a) => a.name === name)).toBe(true);
  const scene = exampleScene("forest-meeting");
  const preview = characterGroup(scene, { mannequin: asset });
  const capture = characterGroup(scene, { mannequin: asset });
  expect(preview.group.children).toHaveLength(2);
  preview.group.updateMatrixWorld(true);
  const size = new THREE.Box3()
    .setFromObject(preview.group, true)
    .getSize(new THREE.Vector3());
  expect(size.y).toBeGreaterThan(1.5);
  expect(size.y).toBeLessThan(2.2);
  const bones = (group: THREE.Group) => {
    const values: number[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.Bone)
        values.push(...node.position.toArray(), ...node.quaternion.toArray());
    });
    return values;
  };
  const original = bones(capture.group);
  preview.sample(0.7);
  expect(bones(preview.group)).not.toEqual(original);
  expect(bones(capture.group)).toEqual(original);
  capture.sample(0.7);
  expect(bones(capture.group)).toEqual(bones(preview.group));
  preview.sample(1.3);
  preview.sample(0.7);
  expect(bones(preview.group)).toEqual(bones(capture.group));
  const meshes = (group: THREE.Object3D) => {
    const list: THREE.SkinnedMesh[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) list.push(node);
    });
    return list;
  };
  const a = meshes(preview.group),
    b = meshes(capture.group),
    source = meshes(asset.scene);
  expect(a[0].skeleton).not.toBe(b[0].skeleton);
  expect(a[0].geometry).not.toBe(b[0].geometry);
  expect(a[0].material).not.toBe(source[0].material);
  disposeGroup(preview.group);
  capture.sample(1);
  expect(bones(capture.group).every(Number.isFinite)).toBe(true);
  disposeGroup(capture.group);
});

it("loads the CC0 dog with its authored clips, neutral material and isolated playback", async () => {
  const bytes = await readFile("public/world-assets/Pug.glb");
  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const { CHARACTER_MODELS } =
    await import("../shared/scene/character-catalog");
  const { sceneSubject } = await import("../shared/scene/subject");
  const { parseScene } = await import("../shared/scene/parse");
  const scene = sceneSubject(exampleScene("forest"), "pug");
  for (const clip of Object.values(CHARACTER_MODELS.pug.clips))
    expect(asset.animations.some((a) => a.name === clip)).toBe(true);
  expect(() =>
    parseScene({
      ...scene,
      characters: [{ ...scene.characters![0], pose: "talk" }],
    }),
  ).toThrow(/no talk/);
  const walking = parseScene({
    ...scene,
    characters: [{ ...scene.characters![0], pose: "walk" }],
  });
  const a = characterGroup(walking, { pug: asset }),
    b = characterGroup(walking, { pug: asset });
  const joints = (group: THREE.Group) => {
    const result: number[] = [];
    group.traverse((n) => {
      if (n instanceof THREE.Bone) result.push(...n.quaternion.toArray());
    });
    return result;
  };
  const before = joints(b.group);
  a.sample(0.3);
  expect(joints(a.group)).not.toEqual(before);
  expect(joints(b.group)).toEqual(before);
  b.sample(0.3);
  expect(joints(a.group)).toEqual(joints(b.group));
  a.group.updateMatrixWorld(true);
  const size = new THREE.Box3()
    .setFromObject(a.group, true)
    .getSize(new THREE.Vector3());
  expect(size.y).toBeGreaterThan(0.4);
  expect(size.y).toBeLessThan(0.8);
  a.group.traverse((node) => {
    if (node instanceof THREE.Mesh)
      expect((node.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
        0x9ba3ad,
      );
  });
  disposeGroup(a.group);
  b.sample(0.7);
  expect(joints(b.group).every(Number.isFinite)).toBe(true);
  disposeGroup(b.group);
});
