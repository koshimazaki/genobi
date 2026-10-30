import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exampleScene } from "../shared/scene/examples";
import { bundleZip, importBundle } from "../src/director/bundle";
import {
  carryWorldFiles,
  readWorldFiles,
  WORLD_RECIPE_PATH,
  WORLD_SCENE_PATH,
  writeWorldFile,
} from "../src/director/world-files";
import { recipeRoom } from "../src/world-builder/apply-room";
import {
  findNamedTake,
  namedTakeRecipe,
} from "../src/world-builder/named-takes";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import {
  takeImpacts,
  takeSamples,
  takeSoundWav,
  TAKE_SOUND_RATE,
} from "../src/world-builder/take-sound";
import { base } from "./house-template-fixtures";

const fall = JSON.parse(
  readFileSync(
    new URL(
      "../custom_nodes/director_world_builder/examples/moves/fall.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("the Falling room take", () => {
  it("is the move library's fall recipe, with the audio gain at zero", () => {
    const recipe = namedTakeRecipe("falling-room");
    expect(recipe).toEqual(validateRecipe({ ...fall, audioGain: 0 }));
    expect(recipe.frames).toBe(145);
    expect(recipe.cameraShot).toBe("orbit60");
    expect(recipe.avatarMotion).toEqual([
      { clip: "idle", seconds: 1.5 },
      { clip: "hit", seconds: 0.5 },
      { clip: "fall", seconds: 4 },
    ]);
    expect(findNamedTake("falling-room")?.name).toBe("Falling room");
    expect(() => namedTakeRecipe("nope")).toThrow("falling-room");
  });

  it("puts its sounds where the moves are", () => {
    const at = takeImpacts(namedTakeRecipe("falling-room")).map((i) => i.at);
    expect(at).toEqual([1.5, 3, 3.17].map((n) => expect.closeTo(n, 6)));
    expect(takeImpacts(presetRecipe("Studio"))).toEqual([]);
  });

  it("makes the same dry sound every time, the take's own length", async () => {
    const recipe = namedTakeRecipe("falling-room");
    const a = takeSamples(recipe),
      b = takeSamples(recipe);
    expect(a).toEqual(b);
    expect(a.length).toBe(Math.round((145 / 24) * TAKE_SOUND_RATE));
    const peak = (from: number, to: number) => {
      let p = 0;
      for (
        let i = Math.round(from * TAKE_SOUND_RATE);
        i < to * TAKE_SOUND_RATE;
        i++
      )
        p = Math.max(p, Math.abs(a[i]));
      return p;
    };
    // Quiet room tone before the hit, the hit, the louder floor.
    expect(peak(0.1, 1.4)).toBeLessThan(0.01);
    expect(peak(1.5, 1.7)).toBeGreaterThan(0.2);
    expect(peak(3, 3.3)).toBeGreaterThan(peak(1.5, 1.7));
    expect(peak(0, 6.04)).toBeLessThanOrEqual(0.89 + 1e-6);
    expect(Math.abs(a[a.length - 1])).toBe(0);
    const wav = new Uint8Array(await takeSoundWav(recipe).arrayBuffer());
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(wav.length).toBe(44 + a.length * 2);
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(22, true)).toBe(1);
  });

  it("names the room Apply room puts the sound in", () => {
    expect(recipeRoom(namedTakeRecipe("falling-room"))).toEqual({
      preset: "cathedral",
      label: "Cathedral",
    });
    expect(recipeRoom(presetRecipe("Small room"))?.preset).toBe("small_room");
    expect(recipeRoom(presetRecipe("Club"))?.preset).toBe("empty_club");
    expect(recipeRoom(presetRecipe("Acoustic room"))?.preset).toBe(
      "medium_room",
    );
    expect(recipeRoom(presetRecipe("Playground"))).toBeUndefined();
  });
});

describe("a project's 3D sources in its bundle", () => {
  it("writes the recipe and scene into the ZIP and reads them back", async () => {
    const recipe = namedTakeRecipe("falling-room");
    const scene = exampleScene("cathedral");
    let bundle = writeWorldFile(base(), WORLD_RECIPE_PATH, recipe);
    bundle = writeWorldFile(bundle, WORLD_SCENE_PATH, scene);
    expect(bundle.project.revision).toBe(base().project.revision + 2);
    // Writing the same recipe again changes nothing.
    expect(writeWorldFile(bundle, WORLD_RECIPE_PATH, recipe)).toBe(bundle);
    const zip = bundleZip(bundle);
    expect(Object.keys(unzipSync(zip))).toEqual(
      expect.arrayContaining([WORLD_RECIPE_PATH, WORLD_SCENE_PATH]),
    );
    const reopened = await importBundle(
      new File([new Uint8Array(zip)], "falling-room.zip"),
    );
    expect(readWorldFiles(reopened)).toEqual({ recipe, scene });
    // A project without them writes neither.
    expect(Object.keys(unzipSync(bundleZip(base())))).not.toContain(
      WORLD_RECIPE_PATH,
    );
  });

  it("refuses a bundle whose recipe breaks the World Builder's rules", async () => {
    const bundle = writeWorldFile(
      base(),
      WORLD_RECIPE_PATH,
      namedTakeRecipe("falling-room"),
    );
    const zip = unzipSync(bundleZip(bundle));
    zip[WORLD_RECIPE_PATH] = new TextEncoder().encode(
      JSON.stringify({ ...fall, frames: 100 }),
    );
    const { zipSync } = await import("fflate");
    await expect(
      importBundle(new File([new Uint8Array(zipSync(zip))], "bad.zip")),
    ).rejects.toThrow("World recipe: Use 8k + 1 frames");
  });

  it("keeps the studio's 3D sources when the copy reloads the same project", () => {
    const local = writeWorldFile(
      base(),
      WORLD_RECIPE_PATH,
      namedTakeRecipe("falling-room"),
    );
    const reloaded = carryWorldFiles(local, base());
    expect(reloaded.files.get(WORLD_RECIPE_PATH)).toBe(
      local.files.get(WORLD_RECIPE_PATH),
    );
    const other = { ...base(), project: { ...base().project, id: "other" } };
    expect(carryWorldFiles(local, other).files.has(WORLD_RECIPE_PATH)).toBe(
      false,
    );
  });
});
