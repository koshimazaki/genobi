/** Bundled GLB actors, cloned independently per actor and per capture. */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type {
  CharacterPose,
  SceneCharacter,
} from "../../shared/scene/characters";
type CharacterScene = { characters?: readonly SceneCharacter[] };
import {
  CHARACTER_MODELS,
  type CharacterAsset,
} from "../../shared/scene/character-catalog";

import { creatureActor, localCreature } from "./creature";

const assets: Partial<Record<CharacterAsset, GLTF>> = {};
const pending: Partial<Record<CharacterAsset, Promise<void>>> = {};
export const CHARACTER_CLIPS = CHARACTER_MODELS.mannequin.clips;

/** Readiness is explicit; failed loads can be retried without changing the scene. */
export async function prepareCharacters(spec: CharacterScene) {
  await Promise.all(
    [...new Set(spec.characters?.map((c) => c.asset) ?? [])].map(async (id) => {
      if (id === "creature") {
        if (!localCreature())
          throw new Error("Load the local Creature VRM to use this scene.");
        await prepareCharacters({
          ...spec,
          characters: [
            {
              ...spec.characters!.find((c) => c.asset === id)!,
              asset: "mannequin",
            },
          ],
        });
        return;
      }
      if (assets[id]) return;
      pending[id] ??= new GLTFLoader()
        .loadAsync(
          new URL(
            `./world-assets/${CHARACTER_MODELS[id].file}`,
            document.baseURI,
          ).href,
        )
        .then((asset) => {
          for (const name of Object.values(CHARACTER_MODELS[id].clips))
            if (!asset.animations.some((a) => a.name === name))
              throw new Error(`Missing ${name}.`);
          assets[id] = asset;
        })
        .catch(() => {
          delete pending[id];
          throw new Error(
            `The bundled ${id} could not load. Retry loading the scene.`,
          );
        });
      await pending[id];
    }),
  );
}

/** Exported separately so real GLB clone/animation isolation can be tested. */
export function characterGroup(
  spec: CharacterScene,
  models: Partial<Record<CharacterAsset, GLTF>> = assets,
) {
  const group = new THREE.Group();
  const samplers: ((seconds: number, inPlace?: boolean) => void)[] = [];
  const durations: Partial<Record<CharacterPose, number>> = {};
  const poseSetters: ((pose: CharacterPose) => void)[] = [];
  for (const actor of spec.characters ?? []) {
    const asset =
      actor.asset === "creature" ? localCreature() : models[actor.asset];
    const definition = CHARACTER_MODELS[actor.asset];
    if (!asset)
      throw new Error("Characters are still loading. Wait before capturing.");
    const creature =
      actor.asset === "creature"
        ? creatureActor(asset, models.mannequin!)
        : undefined;
    const model = creature?.model ?? clone(asset.scene);
    if (!creature)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone();
        if (mesh instanceof THREE.SkinnedMesh) mesh.frustumCulled = false;
        const material = new THREE.MeshStandardMaterial({
          color: 0x9ba3ad,
          roughness: 0.95,
          metalness: 0,
        });
        mesh.material = material;
      });
    // Sample the authored idle pose before measuring cloned skeletons.
    const mixer = creature?.mixer ?? new THREE.AnimationMixer(model);
    const animations = creature?.animations ?? asset.animations;
    for (const [pose, name] of Object.entries(definition.clips)) {
      const clip = animations.find((a) => a.name === name);
      if (clip) durations[pose as CharacterPose] = clip.duration;
    }
    const sample =
      creature?.sample ?? ((seconds: number) => mixer.setTime(seconds));
    mixer
      .clipAction(animations.find((a) => a.name === definition.clips.idle)!)
      .play();
    sample(0);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0)
      throw new Error("The actor has no usable height.");
    model.scale.setScalar(definition.height / height);
    model.position.y = (-bounds.min.y * definition.height) / height;
    const holder = new THREE.Group();
    holder.name = `character:${actor.id}`;
    holder.position.set(...actor.position);
    holder.rotation.y = actor.rotationY;
    holder.scale.setScalar(actor.scale);
    holder.add(model);
    group.add(holder);
    mixer.stopAllAction();
    const clipName = (definition.clips as Partial<Record<string, string>>)[
      actor.pose
    ];
    const clip = animations.find((a) => a.name === clipName);
    if (!clip)
      throw new Error(
        `The ${actor.asset} pose ${actor.pose} is unavailable. Assign a local FBX motion to this slot.`,
      );
    mixer.clipAction(clip).play();
    sample(0);
    samplers.push(sample);
    let activePose = actor.pose;
    poseSetters.push((pose) => {
      if (pose === activePose) return;
      const name = (definition.clips as Partial<Record<string, string>>)[pose];
      const next = animations.find((a) => a.name === name);
      if (!next)
        throw new Error(`The ${actor.asset} has no attached ${pose} motion.`);
      mixer.stopAllAction();
      mixer.clipAction(next).reset().play();
      creature?.reset();
      activePose = pose;
    });
  }
  return {
    group,
    duration: (pose: CharacterPose) => durations[pose] ?? 1,
    setPose: (pose: CharacterPose) => poseSetters.forEach((set) => set(pose)),
    sample: (seconds: number, inPlace = false) =>
      samplers.forEach((sample) => sample(seconds, inPlace)),
  };
}
