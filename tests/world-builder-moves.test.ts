import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { CHARACTER_MODELS } from "../shared/scene/character-catalog";
import { CHARACTER_POSES } from "../shared/scene/characters";
import { validateRecipe, defaultRecipe } from "../src/world-builder/recipe";
import { shotPatch } from "../src/world-builder/camera-shots";
import {
  firstClip,
  motionAt,
  motionClips,
  motionSeconds,
} from "../src/world-builder/motion";

/** Animation names from a GLB's JSON chunk. */
function glbClips(file: string): string[] {
  const b = readFileSync(file);
  expect(b.toString("ascii", 0, 4)).toBe("glTF");
  const length = b.readUInt32LE(12);
  expect(b.toString("ascii", 16, 20)).toBe("JSON");
  const json = JSON.parse(b.toString("utf8", 20, 20 + length));
  return json.animations.map((a: { name: string }) => a.name);
}
const MOVES = "custom_nodes/director_world_builder/examples/moves";
const moves = readdirSync(MOVES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(`${MOVES}/${f}`, "utf8"))] as const);

describe("mannequin move library", () => {
  it("names only clips the mannequin GLB holds, keeping the original seven", () => {
    const clips = glbClips("public/world-assets/AnimationLibrary.glb");
    const catalog = CHARACTER_MODELS.mannequin.clips;
    for (const [pose, clip] of Object.entries(catalog)) {
      expect(clips, pose).toContain(clip);
      expect(CHARACTER_POSES).toContain(pose);
    }
    expect(catalog).toMatchObject({
      idle: "Idle_Loop",
      talk: "Idle_Talking_Loop",
      walk: "Walk_Loop",
      interact: "Interact",
      punch: "Punch_Jab",
      spell: "Spell_Simple_Shoot",
      dance: "Dance_Loop",
    });
    for (const plain of ["jog", "sprint", "jump", "roll", "fall", "sit"])
      expect(Object.keys(catalog)).toContain(plain);
    expect(Object.keys(catalog)).toContain("crouch");
  });

  it("keeps the single-clip form and accepts a list of timed moves", () => {
    expect(validateRecipe({ avatarMotion: "walk" }).avatarMotion).toBe("walk");
    const list = [
      { clip: "jog", seconds: 2 },
      { clip: "fall", seconds: 1.5 },
    ];
    expect(validateRecipe({ avatarMotion: list }).avatarMotion).toEqual(list);
    for (const bad of [
      [],
      [{ clip: "fly", seconds: 1 }],
      [{ clip: "jog", seconds: 0 }],
      [{ clip: "jog", seconds: 31 }],
      [{ clip: "jog", seconds: 1, speed: 2 }],
      Array.from({ length: 9 }, () => ({ clip: "idle", seconds: 1 })),
      { clip: "jog", seconds: 1 },
      "Jog_Fwd_Loop",
    ])
      expect(
        () => validateRecipe({ avatarMotion: bad }),
        JSON.stringify(bad),
      ).toThrow();
    expect(() =>
      validateRecipe({ avatarMotion: [{ clip: "jog", seconds: 0 }] }),
    ).toThrow(/clip, seconds/);
    expect(() =>
      validateRecipe({
        avatarAsset: "pug",
        avatarMotion: [{ clip: "sit", seconds: 1 }],
      }),
    ).toThrow();
  });

  it("samples each move on the take's frame grid", () => {
    const list = [
      { clip: "idle" as const, seconds: 1 },
      { clip: "fall" as const, seconds: 0.5 },
      { clip: "sit" as const, seconds: 1 },
    ];
    expect(motionAt(list, 0, 24)).toEqual({
      clip: "idle",
      time: 0,
      hold: false,
    });
    expect(motionAt(list, 23, 24).clip).toBe("idle");
    expect(motionAt(list, 24, 24)).toEqual({
      clip: "fall",
      time: 0,
      hold: true,
    });
    expect(motionAt(list, 35, 24).clip).toBe("fall");
    expect(motionAt(list, 36, 24)).toEqual({
      clip: "sit",
      time: 0,
      hold: false,
    });
    // The last move runs on past its own seconds.
    expect(motionAt(list, 120, 24)).toEqual({
      clip: "sit",
      time: 84 / 24,
      hold: false,
    });
    expect(motionAt("walk", 12, 24)).toEqual({
      clip: "walk",
      time: 0.5,
      hold: false,
    });
    expect(firstClip(list)).toBe("idle");
    expect(motionClips([...list, { clip: "idle", seconds: 1 }])).toEqual([
      "idle",
      "fall",
      "sit",
    ]);
    expect(motionSeconds(list)).toBe(2.5);
    expect(motionSeconds("walk")).toBeNull();
  });

  it("lets a named shot carry the moves for the same take", () => {
    const moves = [{ clip: "jog" as const, seconds: 3 }];
    const patch = shotPatch(
      "sideAction",
      defaultRecipe,
      [0, 0, 0],
      undefined,
      moves,
    );
    expect(patch).toMatchObject({
      cameraShot: "sideAction",
      avatarMotion: moves,
    });
    expect(shotPatch("sideAction", defaultRecipe)).not.toHaveProperty(
      "avatarMotion",
    );
  });

  it("ships one 5 to 10 s take per move, in a room with a named shot", () => {
    expect(moves.length).toBeGreaterThanOrEqual(7);
    for (const [file, recipe] of moves) {
      const r = validateRecipe(recipe);
      // Old saved moves have no measured sub band; normalization adds silence.
      expect(r, file).toEqual({
        ...recipe,
        bandEnvelopes: { sub: [], ...recipe.bandEnvelopes },
      });
      expect(validateRecipe(r), file).toEqual(r);
      expect(r.frames, file).toBeGreaterThanOrEqual(121);
      expect(r.frames, file).toBeLessThanOrEqual(241);
      expect(r.cameraShot, file).not.toBe("custom");
      expect(r.avatar && r.avatarAsset === "mannequin", file).toBe(true);
      expect(
        r.objects.some((p) => p.id === "room-floor"),
        file,
      ).toBe(true);
      expect(Array.isArray(r.avatarMotion), file).toBe(true);
      const seconds = motionSeconds(r.avatarMotion)!;
      expect(seconds, file).toBeLessThanOrEqual(r.frames / 24);
      // A take is named after its move, or the move and a variant
      // (`fall-cathedral`, `dance-balls`), or after its camera shot when the
      // path carries the action (`skydive-cathedral`).
      const name = file.replace(/\.json$/, "");
      expect(
        [...motionClips(r.avatarMotion), r.cameraShot].some(
          (clip) => name === clip || name.startsWith(`${clip}-`),
        ),
        file,
      ).toBe(true);
    }
  });
});
