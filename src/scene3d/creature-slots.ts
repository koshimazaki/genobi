import type { CharacterPose } from "../../shared/scene/characters";
export const LOCAL_MOTIONS: readonly CharacterPose[] = [
  "run",
  "standard-run",
  "breathing",
  "fly",
  "backflip",
  "jump",
  "ninja",
  "twist",
];
export const motionLabel = (pose: string) =>
  ({
    spell: "Fireball",
    ninja: "Ninja Idle",
    breathing: "Breathing Idle",
    "standard-run": "Standard Run",
    fly: "Flying",
    backflip: "Backflip",
  })[pose] ?? pose.replace(/^./, (c) => c.toUpperCase());
export function creatureSlot(filename: string): CharacterPose | undefined {
  const rules: [RegExp, CharacterPose][] = [
    [/twist/i, "twist"],
    [/flip/i, "backflip"],
    [/ninja/i, "ninja"],
    [/jump/i, "jump"],
    [/walk/i, "walk"],
    [/standard[ _-]*run/i, "standard-run"],
    [/run/i, "run"],
    [/fly/i, "fly"],
    [/fireball/i, "spell"],
    [/breathing/i, "breathing"],
    [/idle/i, "idle"],
  ];
  return rules.find(([pattern]) => pattern.test(filename))?.[1];
}
