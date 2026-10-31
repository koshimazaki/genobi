import { LOCAL_MOTIONS } from "../scene3d/creature-slots";
import type { CharacterPose } from "../../shared/scene/characters";
import { defaultCharacterAudio, type CharacterAudio } from "./character-audio";
import {
  BUILDER_CHARACTER_MODELS,
  type BuilderCharacterAsset,
} from "./character-catalog";

export function availableCharacterClips(
  asset: BuilderCharacterAsset,
  attached: Readonly<Record<string, unknown>> = {},
): CharacterPose[] {
  return (
    Object.keys(BUILDER_CHARACTER_MODELS[asset].clips) as CharacterPose[]
  ).filter(
    (clip) =>
      asset !== "creature" || !LOCAL_MOTIONS.includes(clip) || clip in attached,
  );
}

/** Model changes keep valid routes and never hide the Creature attachment flow. */
export function characterAudioForAsset(
  control: CharacterAudio | undefined,
  asset: BuilderCharacterAsset,
  availableClips?: readonly CharacterPose[],
): CharacterAudio | undefined {
  if (!control) return undefined;
  const compatible = control.routes.every(
    (route) =>
      route.clip in BUILDER_CHARACTER_MODELS[asset].clips &&
      (!control.enabled ||
        !route.enabled ||
        !availableClips ||
        availableClips.includes(route.clip)),
  );
  return compatible ? control : defaultCharacterAudio(asset);
}
