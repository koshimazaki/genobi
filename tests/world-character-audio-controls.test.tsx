// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterAudioControls } from "../src/world-builder/CharacterAudioControls";
import { WorkspaceMenus } from "../src/world-builder/WorkspaceMenus";
import { defaultCharacterAudio } from "../src/world-builder/character-audio";
import {
  defaultRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import { CREATURE_SHA256 } from "../shared/scene/creature-reference";
import * as creature from "../src/scene3d/creature-fbx";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import {
  controlButton,
  controlInput,
  mountWorldControl,
  setControlSelect,
} from "./world-ui-harness";

afterEach(() => vi.restoreAllMocks());

function characterSession(asset: Recipe["avatarAsset"] = "mannequin") {
  let current = validateRecipe({
    ...structuredClone(defaultRecipe),
    avatar: true,
    avatarAsset: asset,
    avatarMotion: "walk",
    characterAudio: defaultCharacterAudio(asset),
    creatureReference:
      asset === "creature" ? { sha256: CREATURE_SHA256, motions: {} } : null,
  });
  const changes = vi.fn();
  function Controls() {
    const [recipe, setRecipe] = useState(current);
    const s = {
      recipe,
      ready: true,
      busy: false,
      tune: async (patch: Partial<Recipe>) => {
        current = validateRecipe({ ...current, ...patch });
        changes(patch);
        setRecipe(current);
        return true;
      },
    } as unknown as BuilderSession;
    return <CharacterAudioControls s={s} />;
  }
  return { Controls, changes, current: () => current };
}

describe("character moves from audio", () => {
  it("edits measured band→clip routes and enforces four without overwriting the authored movement", async () => {
    const { Controls, changes, current } = characterSession();
    const { host } = mountWorldControl(<Controls />);
    expect(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="Character route 1 band"]',
      )!.value,
    ).toBe("low");
    expect(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="Character route 1 move"]',
      )!.value,
    ).toBe("jump");
    await act(async () =>
      setControlSelect(host, "Character route 1 band", "high"),
    );
    await act(async () =>
      setControlSelect(host, "Character route 1 move", "dance"),
    );
    await act(async () =>
      controlInput(host, "Audio triggers character moves").click(),
    );
    for (let i = 0; i < 3; i++)
      await act(async () => controlButton(host, "Add character route").click());
    expect(current().characterAudio).toMatchObject({
      enabled: true,
      routes: [{ source: "high", clip: "dance" }, {}, {}, {}],
    });
    expect(controlButton(host, "Add character route").disabled).toBe(true);
    expect(
      new Set(current().characterAudio!.routes.map((route) => route.id)).size,
    ).toBe(4);
    expect(current().avatarMotion).toBe("walk");
    expect(
      changes.mock.calls.every(
        ([patch]) => Object.keys(patch).join() === "characterAudio",
      ),
    ).toBe(true);
    await act(async () =>
      controlButton(host, "Remove character route 2").click(),
    );
    expect(current().characterAudio!.routes).toHaveLength(3);
    expect(controlButton(host, "Add character route").disabled).toBe(false);
  });

  it("keeps unavailable local Creature moves disabled and lets a bundled move be chosen before enabling", async () => {
    vi.spyOn(creature, "creatureMotionReceipt").mockReturnValue({});
    const { Controls, current } = characterSession("creature");
    const { host } = mountWorldControl(<Controls />);
    const jump = host.querySelector<HTMLOptionElement>(
      'select[aria-label="Character route 1 move"] option[value="jump"]',
    )!;
    expect(jump.disabled).toBe(true);
    expect(jump.textContent).toContain("attach FBX");
    expect(controlInput(host, "Audio triggers character moves").disabled).toBe(
      true,
    );
    await act(async () =>
      setControlSelect(host, "Character route 1 move", "walk"),
    );
    expect(controlInput(host, "Audio triggers character moves").disabled).toBe(
      false,
    );
    await act(async () =>
      controlInput(host, "Audio triggers character moves").click(),
    );
    expect(current().characterAudio).toMatchObject({
      enabled: true,
      routes: [{ clip: "walk" }],
    });
  });

  it("switches model with a disabled compatible default when the previous active clip needs an unattached Creature file", async () => {
    vi.spyOn(creature, "creatureMotionReceipt").mockReturnValue({});
    const recipe = {
      ...structuredClone(defaultRecipe),
      characterAudio: defaultCharacterAudio("mannequin"),
    };
    recipe.characterAudio.enabled = true;
    const change = vi.fn<(patch: Partial<Recipe>) => Promise<boolean>>(
        async () => true,
      ),
      onCreature = vi.fn();
    const s = {
      recipe,
      ready: true,
      busy: false,
      change,
    } as unknown as BuilderSession;
    const e = { mode: "shot" } as WorldEditor;
    const { host } = mountWorldControl(
      <WorkspaceMenus s={s} e={e} onCreature={onCreature} />,
    );
    await act(async () =>
      setControlSelect(host, "Scene character", "creature"),
    );
    const patch = vi.mocked(change).mock.calls[0][0] as Partial<Recipe>;
    expect(patch).toMatchObject({
      avatarAsset: "creature",
      characterAudio: { enabled: false },
    });
    expect(() => validateRecipe({ ...recipe, ...patch })).not.toThrow();
    expect(onCreature).toHaveBeenCalledOnce();
  });
});
