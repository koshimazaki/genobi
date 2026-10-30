import {
  CHARACTER_MODELS,
  CHARACTER_ASSETS,
} from "../../shared/scene/character-catalog";
export const BUILDER_CHARACTER_ASSETS = [...CHARACTER_ASSETS, "blob"] as const;
export type BuilderCharacterAsset = (typeof BUILDER_CHARACTER_ASSETS)[number];
export const BUILDER_CHARACTER_MODELS = {
  ...CHARACTER_MODELS,
  blob: { height: 1.2, clips: { idle: "idle", walk: "walk", jump: "jump" } },
} as const;
