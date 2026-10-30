/** Local VRM import; independent raw + normalized rigs for preview and capture. */
import * as THREE from "three";
import {
  VRMHumanoid,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
  type VRMHumanBones,
} from "@pixiv/three-vrm";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { cloneMaterial } from "./material-resources";
import { readCreature } from "./creature-file";
import { creatureMotions } from "./creature-fbx";
import { CHARACTER_MODELS } from "../../shared/scene/character-catalog";
import {
  cloneSprings,
  detachSpringColliders,
  springSampler,
} from "./creature-springs";
import { creatureClips } from "./creature-motion";

let imported: GLTF | undefined;
export function localCreature() {
  return imported;
}

export async function importCreature(file: File) {
  const bytes = await readCreature(file);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const asset = await loader.parseAsync(bytes, "");
  if (!asset.userData.vrm) throw new Error("The creature rig could not load.");
  // Keep the raw rest rig untouched; each actor builds its own normalized rig.
  const vrm = asset.userData.vrm as VRM;
  vrm.humanoid.normalizedHumanBonesRoot.removeFromParent();
  detachSpringColliders(vrm);
  imported = asset;
}

export function creatureActor(asset: GLTF, motions: GLTF) {
  const original = asset.userData.vrm as VRM;
  const model = clone(asset.scene);
  const sourceNodes: THREE.Object3D[] = [],
    nodes: THREE.Object3D[] = [];
  asset.scene.traverse((n) => sourceNodes.push(n));
  model.traverse((n) => nodes.push(n));
  const bones = {} as VRMHumanBones;
  for (const [name, bone] of Object.entries(original.humanoid.rawHumanBones)) {
    const node = nodes[sourceNodes.indexOf(bone.node)];
    if (!node) throw new Error(`Missing creature bone ${name}.`);
    bones[name as keyof VRMHumanBones] = { node };
  }
  const springs = cloneSprings(
    original,
    new Map(sourceNodes.map((n, i) => [n, nodes[i]])),
  );
  const humanoid = new VRMHumanoid(bones);
  model.add(humanoid.normalizedHumanBonesRoot);
  let animations = creatureClips(motions, humanoid);
  for (const [pose, motion] of creatureMotions) {
    const name =
      CHARACTER_MODELS.creature.clips[
        pose as keyof typeof CHARACTER_MODELS.creature.clips
      ];
    const clip = creatureClips(motion, humanoid)[0];
    clip.name = name;
    animations = [...animations.filter((a) => a.name !== name), clip];
  }
  // The source is VRM 0; align with the viewer without changing its material.
  VRMUtils.rotateVRM0({ scene: model, meta: original.meta } as VRM);
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry = node.geometry.clone();
    if (node instanceof THREE.SkinnedMesh) node.frustumCulled = false;
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    const copies = materials.map(cloneMaterial);
    node.material = Array.isArray(node.material) ? copies : copies[0];
  });
  const mixer = new THREE.AnimationMixer(model);
  let inPlace = false;
  const hips = humanoid.getNormalizedBoneNode("hips")!;
  const restHips = hips.position.clone();
  const sampler = springSampler(model, springs, (seconds) => {
    mixer.setTime(seconds);
    if (inPlace) {
      hips.position.x = restHips.x;
      hips.position.z = restHips.z;
    }
    humanoid.update();
  });
  return {
    model,
    animations,
    mixer,
    sample: (seconds: number, walking = false) => {
      if (inPlace !== walking) sampler.reset();
      inPlace = walking;
      sampler.sample(seconds);
    },
    reset: sampler.reset,
  };
}
