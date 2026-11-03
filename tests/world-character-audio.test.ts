import { describe, expect, it } from "vitest";
import { defaultRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  defaultCharacterAudio,
  characterAudioEventAt,
  characterAudioClips,
  routedMotionAt,
  type CharacterAudio,
} from "../src/world-builder/character-audio";
import { loopedMotionAt } from "../src/world-builder/loop";
import { inputSignalRecipe } from "../src/world-builder/input-take-session";
import { TAKE_FRAMES } from "../src/world-builder/take-duration";

function prepared() {
  const recipe = validateRecipe({
    ...defaultRecipe,
    avatar: true,
    audioRoutes: [],
    avatarMotion: [
      { clip: "idle", seconds: 1 },
      { clip: "walk", seconds: 3 },
    ],
  });
  recipe.characterAudio = defaultCharacterAudio("mannequin");
  recipe.characterAudio.enabled = true;
  Object.assign(recipe.characterAudio.routes[0], {
    threshold: 0.3,
    cooldownFrames: 8,
    durationFrames: 6,
    speed: 2,
  });
  const low = Array(recipe.frames).fill(0) as number[];
  for (const [frame, value] of [
    [2, 0.3],
    [3, 0.8],
    [4, 0.2],
    [5, 0.8],
    [6, 0.1],
    [10, 0.9],
  ])
    low[frame] = value;
  recipe.bandEnvelopes.low = low;
  return recipe;
}
const cycle = () => 1.2;

describe("prepared audio character clip triggers", () => {
  it("uses upward threshold crossings, cooldown, duration and speed without rewriting authored motion", () => {
    const recipe = prepared(),
      before = structuredClone(recipe);
    expect(characterAudioEventAt(recipe, 1)).toBeUndefined();
    expect(characterAudioEventAt(recipe, 2)).toMatchObject({
      clip: "jump",
      startFrame: 2,
      ageFrames: 0,
    });
    expect(routedMotionAt(recipe, 4, cycle)).toEqual({
      clip: "jump",
      time: 4 / 24,
      hold: true,
    });
    // The plateau and the early second crossing do not restart the clip.
    expect(characterAudioEventAt(recipe, 7)!.startFrame).toBe(2);
    expect(characterAudioEventAt(recipe, 8)).toBeUndefined();
    expect(characterAudioEventAt(recipe, 10)!.startFrame).toBe(10);
    expect(routedMotionAt(recipe, 30, cycle)).toEqual(
      loopedMotionAt(recipe, 30, cycle),
    );
    expect(routedMotionAt(recipe, 30, cycle).clip).toBe("walk");
    expect(recipe).toEqual(before);
  });

  it("uses first-listed routes for same-frame ties and resumes the timeline after a newer short trigger", () => {
    const recipe = prepared(),
      first = recipe.characterAudio!.routes[0];
    first.durationFrames = 30;
    first.cooldownFrames = 0;
    recipe.bandEnvelopes.low = [0, 0, 1];
    recipe.bandEnvelopes.mid = [0, 0, 1, 0, 1];
    recipe.characterAudio!.routes.push({
      ...first,
      id: "mid-punch",
      source: "mid",
      clip: "punch",
      durationFrames: 2,
    });
    expect(characterAudioEventAt(recipe, 2)!.routeId).toBe(first.id);
    expect(characterAudioEventAt(recipe, 4)!.routeId).toBe("mid-punch");
    expect(characterAudioEventAt(recipe, 6)).toBeUndefined();
    expect(routedMotionAt(recipe, 6, cycle)).toEqual(
      loopedMotionAt(recipe, 6, cycle),
    );
  });

  it("keeps missing bands, disabled routes and old recipes exactly on their authored motion", () => {
    const recipe = prepared();
    recipe.characterAudio!.routes[0].source = "sub";
    for (const frame of [0, 2, 4, 30])
      expect(routedMotionAt(recipe, frame, cycle)).toEqual(
        loopedMotionAt(recipe, frame, cycle),
      );
    recipe.characterAudio!.routes[0].source = "low";
    recipe.characterAudio!.routes[0].enabled = false;
    expect(characterAudioEventAt(recipe, 2)).toBeUndefined();
    recipe.characterAudio!.routes[0].enabled = true;
    recipe.characterAudio!.enabled = false;
    expect(routedMotionAt(recipe, 2, cycle)).toEqual(
      loopedMotionAt(recipe, 2, cycle),
    );
    delete recipe.characterAudio;
    expect(routedMotionAt(recipe, 2, cycle)).toEqual(
      loopedMotionAt(recipe, 2, cycle),
    );
    expect(validateRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(recipe);
  });

  it("seeks directly and backwards, samples fractional clip time, and restarts deterministically at loop boundaries", () => {
    const recipe = prepared();
    const expected = Array.from({ length: recipe.frames }, (_, frame) =>
      routedMotionAt(recipe, frame, cycle),
    );
    for (const frame of [96, 7, 0, 10, 3, 50, 2, 8])
      expect(routedMotionAt(recipe, frame, cycle)).toEqual(expected[frame]);
    expect(routedMotionAt(recipe, 3.5, cycle).time).toBe(3 / 24);
    recipe.loop = true;
    expect(routedMotionAt(recipe, recipe.frames + 3.5, cycle)).toEqual(
      routedMotionAt(recipe, 3.5, cycle),
    );
    expect(routedMotionAt(recipe, -1, cycle)).toEqual(
      routedMotionAt(recipe, recipe.frames - 1, cycle),
    );
    expect(() => characterAudioEventAt(recipe, NaN)).toThrow(/finite/);
  });

  it("uses the complete extended take and keeps onset triggers off during sparse live-input preview", () => {
    const recipe = validateRecipe({
      ...prepared(),
      frames: TAKE_FRAMES.max,
      seconds: 30,
    });
    recipe.bandEnvelopes.low = Array(TAKE_FRAMES.max).fill(0);
    recipe.bandEnvelopes.low[700] = 0.8;
    expect(characterAudioEventAt(recipe, 703)!.startFrame).toBe(700);
    const preview = inputSignalRecipe(recipe, 700, {
      level: 1,
      low: 1,
      mid: 1,
      high: 1,
      sub: 1,
    });
    expect(preview.characterAudio!.enabled).toBe(false);
    expect(characterAudioEventAt(preview, 700)).toBeUndefined();
    expect(recipe.characterAudio!.enabled).toBe(true);
    expect(characterAudioEventAt(recipe, 700)!.clip).toBe("jump");
  });

  it("reports only active required clips and keeps defaults fresh for each known actor", () => {
    const recipe = prepared();
    expect(characterAudioClips(recipe)).toEqual(["jump"]);
    recipe.characterAudio!.routes[0].enabled = false;
    expect(characterAudioClips(recipe)).toEqual([]);
    for (const asset of ["mannequin", "pug", "creature", "blob"] as const) {
      const control = defaultCharacterAudio(asset);
      expect(
        validateRecipe({
          ...defaultRecipe,
          avatarAsset: asset,
          characterAudio: control,
        }).characterAudio,
      ).toEqual(control);
      control.routes[0].threshold = 0.7;
      expect(defaultCharacterAudio(asset).routes[0].threshold).toBe(0.15);
    }
  });
});

describe("bounded named-clip character routing schema", () => {
  it.each([
    (c: CharacterAudio) => {
      c.version = 2 as 1;
    },
    (c: CharacterAudio) => {
      c.routes = Array.from({ length: 5 }, (_, index) => ({
        ...c.routes[0],
        id: `route-${index}`,
      }));
    },
    (c: CharacterAudio) => {
      c.routes.push({ ...c.routes[0] });
    },
    (c: CharacterAudio) => {
      c.routes[0].source = "drums" as "low";
    },
    (c: CharacterAudio) => {
      c.routes[0].source = ["low"] as unknown as "low";
    },
    (c: CharacterAudio) => {
      c.routes[0].clip = "fly";
    },
    (c: CharacterAudio) => {
      c.routes[0].clip = "https://example.test/clip" as "jump";
    },
    (c: CharacterAudio) => {
      c.routes[0].threshold = 0;
    },
    (c: CharacterAudio) => {
      c.routes[0].threshold = NaN;
    },
    (c: CharacterAudio) => {
      c.routes[0].cooldownFrames = 1.5;
    },
    (c: CharacterAudio) => {
      c.routes[0].durationFrames = TAKE_FRAMES.max + 1;
    },
    (c: CharacterAudio) => {
      c.routes[0].durationFrames = 0;
    },
    (c: CharacterAudio) => {
      c.routes[0].speed = 5;
    },
    (c: CharacterAudio) => {
      Object.assign(c.routes[0], { expression: "arbitrary code" });
    },
  ])("refuses invalid or unknown character input %#", (mutate) => {
    const recipe = prepared();
    mutate(recipe.characterAudio!);
    expect(() => validateRecipe(recipe)).toThrow(/character|Character/);
  });
});
