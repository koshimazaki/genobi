import * as T from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBuilderCharacter } from "../src/world-builder/character";
import { defaultRecipe, type Recipe } from "../src/world-builder/recipe";

const { preload, makeActor, makeBlob } = vi.hoisted(() => ({
  preload: vi.fn(),
  makeActor: vi.fn(),
  makeBlob: vi.fn(),
}));
vi.mock("../src/scene3d/characters", () => ({
  prepareCharacters: preload,
  characterGroup: makeActor,
}));
vi.mock("../src/world-builder/blob", () => ({
  blobActor: makeBlob,
  blobCycle: () => 1,
}));

const recipe = (avatarAsset: Recipe["avatarAsset"], avatar = true): Recipe => ({
  ...defaultRecipe,
  scene: "playground",
  avatar,
  avatarAsset,
});
const subject = () => createBuilderCharacter(new T.Scene());
beforeEach(() => {
  preload.mockReset().mockResolvedValue(undefined);
  makeActor.mockReset().mockImplementation(() => ({
    group: new T.Group(),
    duration: () => 1,
    sample: vi.fn(),
    setPose: vi.fn(),
  }));
  makeBlob.mockReset().mockImplementation(() => ({
    group: new T.Group(),
    dispose: vi.fn(),
    freeze: vi.fn(),
    thaw: vi.fn(),
    sample: vi.fn(),
    appearance: () => ({ theme: "test", colour: "#ffffff" }),
  }));
});

describe("guarded character preparation", () => {
  it("keeps the live actor while assets load and while a prepared commit is withheld", async () => {
    const character = subject();
    (await character.prepare(recipe("blob")))();
    const before = character.root.children[0];
    let release!: () => void;
    preload.mockReturnValue(
      new Promise<void>((resolve) => (release = resolve)),
    );
    const preparing = character.prepare(recipe("pug"));
    expect(character.root.visible).toBe(true);
    expect(character.root.children).toEqual([before]);
    expect(makeActor).not.toHaveBeenCalled();
    release();
    const commit = await preparing;
    // A revision/project guard may now refuse and discard this closure.
    expect(character.root.children).toEqual([before]);
    expect(makeActor).not.toHaveBeenCalled();
    commit();
    expect(makeActor).toHaveBeenCalledOnce();
    expect(character.root.children).not.toContain(before);
    character.dispose();
  });

  it("does not hide or replace the live actor for discarded invisible/blob preparations", async () => {
    const character = subject();
    (await character.prepare(recipe("pug")))();
    const before = character.root.children[0];
    const hide = await character.prepare(recipe("pug", false));
    await character.prepare(recipe("blob"));
    expect(character.root.visible).toBe(true);
    expect(character.root.children).toEqual([before]);
    expect(makeBlob).not.toHaveBeenCalled();
    hide();
    expect(character.root.visible).toBe(false);
    expect(character.root.children).toEqual([before]);
    character.dispose();
  });

  it("preserves the current actor if preloading or cloning fails", async () => {
    const character = subject();
    (await character.prepare(recipe("blob")))();
    const before = character.root.children[0];
    preload.mockRejectedValueOnce(new Error("Asset unavailable"));
    await expect(character.prepare(recipe("pug"))).rejects.toThrow(
      "Asset unavailable",
    );
    expect(character.root.children).toEqual([before]);
    const commit = await character.prepare(recipe("pug"));
    makeActor.mockImplementationOnce(() => {
      throw new Error("Invalid actor");
    });
    expect(commit).toThrow("Invalid actor");
    expect(character.root.visible).toBe(true);
    expect(character.root.children).toEqual([before]);
    character.dispose();
  });

  it("cannot attach a prepared actor after the scene closes", async () => {
    const character = subject();
    const commit = await character.prepare(recipe("pug"));
    character.dispose();
    expect(commit).toThrow("Scene was closed");
    expect(makeActor).not.toHaveBeenCalled();
    expect(character.root.children).toEqual([]);
  });
});
