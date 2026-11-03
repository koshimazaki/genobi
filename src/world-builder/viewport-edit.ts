import type { WorldRuntime } from "./runtime";
import type { SceneAdapter } from "./scene-adapter";
import type { Recipe } from "./recipe";

/** A camera gesture is one authored edit, held through commit and frame restore. */
export async function commitViewportEdit(
  adapter: SceneAdapter,
  world: Pick<WorldRuntime, "editor" | "renderFrame">,
  patch: Partial<Recipe>,
  previewFrame: number | undefined,
  alive: () => boolean,
  fail: (error: unknown) => void,
) {
  const release =
    previewFrame === undefined ? undefined : world.editor?.holdEdits();
  try {
    await adapter.configure({ ...adapter.getRecipe(), ...patch });
    if (alive() && previewFrame !== undefined)
      await adapter.render(previewFrame);
  } catch (error) {
    if (!alive()) return;
    fail(error);
    if (previewFrame !== undefined)
      await world.renderFrame(previewFrame).catch(() => {});
  } finally {
    release?.();
  }
}

/** The renderer reports edits before React rerenders; read the mounted adapter. */
export function viewportEditHandler(
  api: { current: SceneAdapter | null },
  owner: () => { world: WorldRuntime; alive: boolean },
  fail: (message: string) => void,
) {
  return (patch: Partial<Recipe>, frame?: number) => {
    if (api.current)
      void commitViewportEdit(
        api.current,
        owner().world,
        patch,
        frame,
        () => owner().alive,
        (error) => fail(error instanceof Error ? error.message : String(error)),
      );
  };
}
