/** Fixed local models and exact authored clips; scene JSON cannot fetch models. */
export const CHARACTER_ASSETS = ["mannequin", "pug", "creature"] as const;
export type CharacterAsset = (typeof CHARACTER_ASSETS)[number];
export const CHARACTER_MODELS = {
  mannequin: {
    file: "AnimationLibrary.glb",
    height: 1.8,
    clips: {
      idle: "Idle_Loop",
      talk: "Idle_Talking_Loop",
      walk: "Walk_Loop",
      interact: "Interact",
      punch: "Punch_Jab",
      spell: "Spell_Simple_Shoot",
      dance: "Dance_Loop",
      jog: "Jog_Fwd_Loop",
      sprint: "Sprint_Loop",
      jump: "Jump_Start",
      "jump-air": "Jump_Loop",
      land: "Jump_Land",
      roll: "Roll",
      fall: "Death01",
      "sit-down": "Sitting_Enter",
      sit: "Sitting_Idle_Loop",
      "sit-talk": "Sitting_Talking_Loop",
      "stand-up": "Sitting_Exit",
      crouch: "Crouch_Idle_Loop",
      "crouch-walk": "Crouch_Fwd_Loop",
      "walk-formal": "Walk_Formal_Loop",
      push: "Push_Loop",
      kneel: "Fixing_Kneeling",
      "pick-up": "PickUp_Table",
      hit: "Hit_Chest",
      sword: "Sword_Attack",
    },
    credit: "Holodeck/ECCTRL mannequin (MIT), Quaternius animations (CC0).",
  },
  creature: {
    file: null,
    height: 1.8,
    clips: {
      idle: "Idle_Loop",
      talk: "Idle_Talking_Loop",
      walk: "Walk_Loop",
      interact: "Interact",
      punch: "Punch_Jab",
      spell: "Spell_Simple_Shoot",
      dance: "Dance_Loop",
      run: "Creature_Run",
      fly: "Creature_Fly",
      backflip: "Creature_Backflip",
      ninja: "Creature_Ninja",
      breathing: "Creature_Breathing",
      "standard-run": "Creature_Standard_Run",
      twist: "Creature_Twist",
      jump: "Creature_Jump",
    },
    credit:
      "Glitch Candies creature: owner-supplied VRM, original materials preserved. Model not bundled or redistributed. Quaternius motion (CC0). Canonical SHA256: 464911455033e0d3637333a1e5bd9f8653c4ea295c3700a114bd498bbfe5670b. Optional local FBX motions have operator-supplied rights. Verify rights for your intended use; repository MIT licence does not cover the creature.",
  },
  pug: {
    file: "Pug.glb",
    height: 0.55,
    clips: {
      idle: "Idle",
      walk: "Walk",
      "walk-slow": "WalkSlow",
      jump: "Jump",
    },
    credit:
      "Pug by Quaternius, LowPoly Animated Farm Animal Pack (CC0-1.0); glTF from Three.js r180, repacked as GLB. Runtime uses neutral grey materials. https://opengameart.org/content/lowpoly-animated-farm-animal-pack",
  },
} as const;

/**
 * Clips whose last pose is not their first, found by sampling the bundled
 * GLBs: the largest bone rotation (over 5°) or translation (over 0.01) between
 * the first and last keyframe. Looping one alone snaps back at the seam
 * (Death01 moves the hips 0.94). Every other mannequin and pug clip, the
 * `_Loop` clips and the gestures that return to rest (Interact, Punch_Jab,
 * Spell_Simple_Shoot, Sword_Attack, PickUp_Table, Fixing_Kneeling), meets
 * itself. The creature's clips are not bundled, so they are not listed.
 */
export const NON_CYCLIC_CLIPS: ReadonlySet<string> = new Set([
  "Jump_Start",
  "Jump_Land",
  "Roll",
  "Death01",
  "Sitting_Enter",
  "Sitting_Exit",
  "Hit_Chest",
]);
