import { readFile } from "node:fs/promises";
import * as THREE from "three";
import {
  MToonMaterial,
  VRMHumanoid,
  type VRMHumanBones,
} from "@pixiv/three-vrm";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { creatureActor } from "../src/scene3d/creature";
import { creatureDocument, readCreature } from "../src/scene3d/creature-file";
import { sceneSubject } from "../shared/scene/subject";
import { exampleScene } from "../shared/scene/examples";
import { parseScene } from "../shared/scene/parse";
import { disposeGroup } from "../src/scene3d/build-scene";

function vrmFixture() {
  const scene = new THREE.Group();
  const bones = {} as VRMHumanBones;
  for (const [name, parent, x, y] of [
    ["hips", "", 0, 1],
    ["spine", "hips", 0, 0.2],
    ["chest", "spine", 0, 0.2],
    ["neck", "chest", 0, 0.1],
    ["head", "neck", 0, 0.1],
    ["leftUpperArm", "chest", 0.2, 0],
    ["leftLowerArm", "leftUpperArm", 0.2, 0],
    ["leftHand", "leftLowerArm", 0.2, 0],
    ["rightUpperArm", "chest", -0.2, 0],
    ["rightLowerArm", "rightUpperArm", -0.2, 0],
    ["rightHand", "rightLowerArm", -0.2, 0],
    ["leftUpperLeg", "hips", 0.1, 0],
    ["leftLowerLeg", "leftUpperLeg", 0, -0.4],
    ["leftFoot", "leftLowerLeg", 0, -0.4],
    ["rightUpperLeg", "hips", -0.1, 0],
    ["rightLowerLeg", "rightUpperLeg", 0, -0.4],
    ["rightFoot", "rightLowerLeg", 0, -0.4],
  ] as const) {
    const node = new THREE.Bone();
    node.name = name;
    node.position.set(x, y, 0);
    (parent ? bones[parent]!.node : scene).add(node);
    bones[name] = { node };
  }
  const texture = new THREE.Texture();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff22ab, map: texture }),
    ),
  );
  scene.updateMatrixWorld(true);
  return {
    scene,
    animations: [],
    userData: {
      vrm: { humanoid: new VRMHumanoid(bones), meta: { metaVersion: "0" } },
    },
  } as unknown as GLTF;
}

it("retargets the real mannequin's sanitized bones and up axis without moving the creature out of shot", async () => {
  const bytes = await readFile("public/world-assets/AnimationLibrary.glb");
  const motions = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const asset = vrmFixture();
  const a = creatureActor(asset, motions),
    b = creatureActor(asset, motions);
  const clip = a.animations.find((c) => c.name === "Idle_Talking_Loop")!;
  expect(clip.tracks.length).toBeGreaterThan(15);
  a.mixer.clipAction(clip).play();
  b.mixer.clipAction(b.animations.find((c) => c.name === clip.name)!).play();
  const pose = (model: THREE.Object3D) => {
    const values: number[] = [];
    model.traverse((n) => {
      if (n instanceof THREE.Bone)
        values.push(...n.position.toArray(), ...n.quaternion.toArray());
    });
    return values;
  };
  a.sample(0);
  b.sample(0);
  const start = pose(b.model);
  a.sample(0.7);
  expect(pose(a.model)).not.toEqual(start);
  expect(pose(b.model)).toEqual(start);
  b.sample(0.7);
  expect(pose(b.model)).toEqual(pose(a.model));
  a.sample(1.2);
  a.sample(0.7);
  expect(pose(a.model)).toEqual(pose(b.model));
  const hips = a.model.getObjectByName("hips")!;
  expect(Math.abs(hips.position.z)).toBeLessThan(0.2);
  expect(hips.position.y).toBeGreaterThan(0.8);
  expect(hips.position.y).toBeLessThan(1.2);
  const mesh = (m: THREE.Object3D) => {
    let found: THREE.Mesh;
    m.traverse((n) => {
      if (n instanceof THREE.Mesh) found = n;
    });
    return found!;
  };
  const ma = mesh(a.model).material as THREE.MeshStandardMaterial,
    mb = mesh(b.model).material as THREE.MeshStandardMaterial;
  expect(ma.color.getHex()).toBe(0xff22ab);
  expect(ma).not.toBe(mb);
  expect(ma.map).not.toBe(mb.map);
  disposeGroup(a.model);
  b.sample(1);
  expect(pose(b.model).every(Number.isFinite)).toBe(true);
  disposeGroup(b.model);
});

it("allows a creature beside a mannequin in saved scenes without changing the original", () => {
  const base = exampleScene("forest-meeting");
  const mixed = parseScene({
    ...base,
    characters: base.characters!.map((c, i) => ({
      ...c,
      asset: i ? "creature" : "mannequin",
    })),
  });
  expect(mixed.characters!.map((c) => c.asset)).toEqual([
    "mannequin",
    "creature",
  ]);
  expect(
    sceneSubject(base, "creature").characters!.every(
      (c) => c.asset === "creature",
    ),
  ).toBe(true);
  expect(base.characters!.every((c) => c.asset === "mannequin")).toBe(true);
});

it("refuses invalid, external-resource and noncanonical VRMs before parsing textures", async () => {
  expect(() => creatureDocument(new ArrayBuffer(20))).toThrow("valid binary");
  const json = new TextEncoder().encode(
    JSON.stringify({
      extensions: { VRM: { humanoid: { humanBones: [{}] } } },
      images: [{ uri: "https://example.com/image.png" }],
    }),
  );
  const bytes = new ArrayBuffer(20 + json.length);
  const header = new DataView(bytes);
  [0x46546c67, 2, bytes.byteLength, json.length, 0x4e4f534a].forEach((n, i) =>
    header.setUint32(i * 4, n, true),
  );
  new Uint8Array(bytes, 20).set(json);
  expect(() => creatureDocument(bytes)).toThrow("own buffers and images");
  const invalid = new File([new Uint8Array(20)], "creature.vrm");
  await expect(readCreature(invalid)).rejects.toThrow();
});

it("owns and releases MToon uniform textures without disposing a sibling or the cache", async () => {
  const { cloneMaterial, disposeMaterial } =
    await import("../src/scene3d/material-resources");
  const texture = new THREE.Texture();
  const material = new MToonMaterial({
    map: texture,
    shadeMultiplyTexture: texture,
  });
  const a = cloneMaterial(material) as MToonMaterial,
    b = cloneMaterial(material) as MToonMaterial;
  expect(a.map).not.toBe(texture);
  expect(a.map).not.toBe(b.map);
  expect(a.shadeMultiplyTexture).not.toBe(texture);
  let sourceDisposed = false,
    siblingDisposed = false,
    ownDisposed = false;
  texture.addEventListener("dispose", () => {
    sourceDisposed = true;
  });
  b.map!.addEventListener("dispose", () => {
    siblingDisposed = true;
  });
  a.map!.addEventListener("dispose", () => {
    ownDisposed = true;
  });
  disposeMaterial(a);
  expect(ownDisposed).toBe(true);
  expect(sourceDisposed).toBe(false);
  expect(siblingDisposed).toBe(false);
  disposeMaterial(b);
  disposeMaterial(material);
});
