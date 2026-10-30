import type { CharacterPose } from "../../shared/scene/characters";
export interface WalkState {
  moving: boolean;
  running: boolean;
  jumping: boolean;
  action?: CharacterPose;
  restart?: boolean;
}
export function walkPose(
  asset: string,
  idle: CharacterPose,
  state: WalkState,
  motions: { has(pose: CharacterPose): boolean },
): CharacterPose {
  if (state.jumping) {
    if (asset === "creature" && motions.has("backflip")) return "backflip";
    if (
      asset === "pug" ||
      asset === "blob" ||
      (asset === "creature" && motions.has("jump"))
    )
      return "jump";
  }
  if (
    state.action &&
    asset === "creature" &&
    (motions.has(state.action) || state.action === "spell")
  )
    return state.action;
  if (state.moving) {
    if (asset === "creature" && state.running && motions.has("run"))
      return "run";
    return "walk";
  }
  return idle;
}
