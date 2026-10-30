/** Optional local Mixamo FBX motion. The FBX itself is never exported. */
import {
  LOCAL_MOTION_SOURCE,
  type CreatureReference,
} from "../../shared/scene/creature-reference";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { CharacterPose } from "../../shared/scene/characters";
import { CHARACTER_MODELS } from "../../shared/scene/character-catalog";

interface Motion {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  sha256: string;
}
export const creatureMotions = new Map<CharacterPose, Motion>();

export async function importCreatureMotion(file: File, pose: CharacterPose) {
  if (!(pose in CHARACTER_MODELS.creature.clips))
    throw new Error("Unsupported creature motion slot.");
  if (!/\.fbx$/i.test(file.name) || file.size > 16 * 1024 * 1024)
    throw new Error("Choose an animation-only FBX, up to 16 MB.");
  const bytes = await file.arrayBuffer();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(() => {
    throw new Error("FBX motion must not load external files.");
  });
  const scene = new FBXLoader(manager).parse(bytes, "");
  const clip = scene.animations[0];
  if (
    !scene.getObjectByName("mixamorigHips") ||
    !clip?.tracks.length ||
    clip.duration <= 0 ||
    clip.duration > 120
  )
    throw new Error("Choose a Mixamo humanoid animation (up to two minutes).");
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  creatureMotions.set(pose, { scene, animations: [clip], sha256 });
}

export function creatureMotionReceipt(): CreatureReference["motions"] {
  return Object.fromEntries(
    [...creatureMotions].map(([pose, motion]) => [
      pose,
      {
        sha256: motion.sha256,
        source: LOCAL_MOTION_SOURCE as typeof LOCAL_MOTION_SOURCE,
      },
    ]),
  );
}
