import { readFile } from "node:fs/promises";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { validateRecipe, presetRecipe } from "../src/world-builder/recipe";
import { characterGroup } from "../src/scene3d/characters";
import { CREATURE_SHA256 } from "../shared/scene/creature-reference";

it("keeps legacy mannequin recipes and validates asset-specific motion and references", () => {
  expect(validateRecipe({ avatar: true }).avatarAsset).toBe("mannequin");
  expect(
    validateRecipe({ avatarAsset: "pug", avatarMotion: "jump" }).avatarMotion,
  ).toBe("jump");
  for (const patch of [
    { avatarAsset: "url" },
    { avatarAsset: "pug", avatarMotion: "dance" },
    { creatureReference: { sha256: "bad", motions: {} } },
  ])
    expect(() => validateRecipe(patch)).toThrow();
  const r = validateRecipe({
    ...presetRecipe("Studio"),
    avatar: true,
    avatarAsset: "creature",
    creatureReference: { sha256: CREATURE_SHA256, motions: {} },
  });
  expect(validateRecipe(JSON.parse(JSON.stringify(r)))).toEqual(r);
});
it("samples the real dog independently at exact frame times", async () => {
  const bytes = await readFile("public/world-assets/Pug.glb");
  const model = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  expect(model.animations.map((a) => a.name)).toEqual(
    expect.arrayContaining(["Idle", "Walk", "WalkSlow", "Jump"]),
  );
  const spec = {
    characters: [
      {
        id: "dog",
        asset: "pug" as const,
        pose: "walk" as const,
        position: [0, 0, 0] as [number, number, number],
        rotationY: 0,
        scale: 1,
      },
    ],
  };
  const first = characterGroup(spec, { pug: model });
  const second = characterGroup(spec, { pug: model });
  const bones = (root: T.Group) => {
    const result: number[] = [];
    root.traverse((o) => {
      if (o instanceof T.Bone)
        result.push(...o.quaternion.toArray(), ...o.position.toArray());
    });
    return result;
  };
  const idle = bones(second.group);
  first.sample(0.2);
  expect(bones(first.group)).not.toEqual(idle);
  expect(bones(second.group)).toEqual(idle);
  second.sample(0.2);
  expect(bones(first.group)).toEqual(bones(second.group));
  first.sample(1.2);
  first.sample(0.2);
  expect(bones(first.group)).toEqual(bones(second.group));
});
