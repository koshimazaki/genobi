/** Bundled actors only: no document can name a URL, mesh or executable file. */
import { fail, number, oneOf, record, sceneId, vec3 } from "./parse";
import type { Vec3 } from "./types";
import {
  CHARACTER_ASSETS,
  CHARACTER_MODELS,
  type CharacterAsset,
} from "./character-catalog";

export const CHARACTER_POSES = [
  "idle",
  "talk",
  "walk",
  "interact",
  "punch",
  "spell",
  "dance",
  "walk-slow",
  "jump",
  "run",
  "fly",
  "backflip",
  "ninja",
  "breathing",
  "standard-run",
  "twist",
  "jog",
  "sprint",
  "jump-air",
  "land",
  "roll",
  "fall",
  "sit-down",
  "sit",
  "sit-talk",
  "stand-up",
  "crouch",
  "crouch-walk",
  "walk-formal",
  "push",
  "kneel",
  "pick-up",
  "hit",
  "sword",
] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];
export interface SceneCharacter {
  id: string;
  asset: CharacterAsset;
  pose: CharacterPose;
  position: Vec3;
  rotationY: number;
  scale: number;
}

export function parseCharacters(value: unknown): SceneCharacter[] {
  if (!Array.isArray(value) || value.length > 8)
    fail("Use at most eight characters.");
  const characters = (value as unknown[]).map((item) => {
    const c = record(
      item,
      ["id", "asset", "pose", "position", "rotationY", "scale"],
      "A character",
    );
    return {
      id: sceneId(c.id, "Character id"),
      asset: oneOf(c.asset, CHARACTER_ASSETS, "character asset"),
      pose: oneOf(c.pose, CHARACTER_POSES, "character pose"),
      position: vec3(c.position, -500, 500, "Character position"),
      rotationY: number(
        c.rotationY ?? 0,
        -2 * Math.PI,
        2 * Math.PI,
        "Character rotation",
      ),
      scale: number(c.scale ?? 1, 0.25, 3, "Character scale"),
    };
  });
  for (const c of characters)
    if (!(c.pose in CHARACTER_MODELS[c.asset].clips))
      fail(`The ${c.asset} has no ${c.pose} pose.`);
  if (new Set(characters.map((c) => c.id)).size !== characters.length)
    fail("Duplicate character id.");
  return characters;
}
