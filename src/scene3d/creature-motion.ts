/** Quaternius mannequin -> normalized VRM bones, using world rest rotations.
 * Follows pixiv/three-vrm's humanoid-animation example (MIT); no Mixamo files.
 */
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { VRMHumanoid, VRMHumanBoneName } from "@pixiv/three-vrm";

const BONES: Record<string, VRMHumanBoneName> = {
  "DEF-hips": "hips",
  "DEF-spine.001": "spine",
  "DEF-spine.002": "chest",
  "DEF-spine.003": "upperChest",
  "DEF-neck": "neck",
  "DEF-head": "head",
};
for (const [side, name] of [
  ["L", "left"],
  ["R", "right"],
] as const) {
  for (const [source, target] of [
    ["shoulder", "Shoulder"],
    ["upper_arm", "UpperArm"],
    ["forearm", "LowerArm"],
    ["hand", "Hand"],
    ["thigh", "UpperLeg"],
    ["shin", "LowerLeg"],
    ["foot", "Foot"],
    ["toe", "Toes"],
  ])
    BONES[`DEF-${source}.${side}`] = `${name}${target}` as VRMHumanBoneName;
}

for (const [name, bone] of Object.entries(BONES))
  BONES[THREE.PropertyBinding.sanitizeNodeName(name)] = bone;

const MIXAMO: Record<string, VRMHumanBoneName> = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
};
for (const [side, target] of [
  ["Left", "left"],
  ["Right", "right"],
] as const) {
  for (const [source, bone] of [
    ["Shoulder", "Shoulder"],
    ["Arm", "UpperArm"],
    ["ForeArm", "LowerArm"],
    ["Hand", "Hand"],
    ["UpLeg", "UpperLeg"],
    ["Leg", "LowerLeg"],
    ["Foot", "Foot"],
    ["ToeBase", "Toes"],
  ])
    MIXAMO[`mixamorig${side}${source}`] =
      `${target}${bone}` as VRMHumanBoneName;
  for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const)
    for (const i of [1, 2, 3]) {
      const joint =
        finger === "Thumb"
          ? ["Metacarpal", "Proximal", "Distal"][i - 1]
          : ["Proximal", "Intermediate", "Distal"][i - 1];
      MIXAMO[`mixamorig${side}Hand${finger}${i}`] =
        `${target}${finger === "Pinky" ? "Little" : finger}${joint}` as VRMHumanBoneName;
    }
}

export function creatureClips(
  source: Pick<GLTF, "scene" | "animations">,
  humanoid: VRMHumanoid,
) {
  source.scene.updateMatrixWorld(true);
  const mixamo = Boolean(source.scene.getObjectByName("mixamorigHips"));
  const map = mixamo ? MIXAMO : BONES;
  const hips = source.scene.getObjectByName(
    mixamo ? "mixamorigHips" : "DEF-hips",
  );
  const targetHips = humanoid.getNormalizedBoneNode("hips");
  if (!hips || !targetHips || !hips.parent)
    throw new Error("The animation rig has no usable hips.");
  const hipsParentMatrix = hips.parent.matrixWorld.clone();
  const sourceRest = hips.getWorldPosition(new THREE.Vector3());
  const targetRest = targetHips.position.clone();
  if (sourceRest.y <= 0 || targetRest.y <= 0)
    throw new Error("The animation hips must be above the ground.");
  const scale = targetRest.y / sourceRest.y;
  return source.animations.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      // Bone names contain dots; split at the property, not the first dot.
      const split = track.name.lastIndexOf(".");
      const name = track.name.slice(0, split),
        property = track.name.slice(split + 1);
      const bone = map[name];
      const target = bone && humanoid.getNormalizedBoneNode(bone);
      const node = source.scene.getObjectByName(name);
      if (!target || !node) continue;
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const inverse = node
          .getWorldQuaternion(new THREE.Quaternion())
          .invert();
        const parent = node.parent!.getWorldQuaternion(new THREE.Quaternion());
        const values = track.values.slice();
        const q = new THREE.Quaternion();
        for (let i = 0; i < values.length; i += 4) {
          q.fromArray(values, i).premultiply(parent).multiply(inverse);
          // VRM 0 faces backwards relative to VRM 1's normalized space.
          q.x *= -1;
          q.z *= -1;
          q.normalize().toArray(values, i);
        }
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${target.name}.${property}`,
            track.times,
            values,
          ),
        );
      } else if (bone === "hips" && property === "position") {
        const values = track.values.slice();
        const v = new THREE.Vector3();
        for (let i = 0; i < values.length; i += 3) {
          v.fromArray(values, i)
            .applyMatrix4(hipsParentMatrix)
            .sub(sourceRest)
            .multiplyScalar(scale);
          v.x *= -1;
          v.z *= -1;
          v.add(targetRest).toArray(values, i);
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${target.name}.position`,
            track.times,
            values,
          ),
        );
      }
    }
    if (!tracks.length)
      throw new Error(`No retargetable motion in ${clip.name}.`);
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}
