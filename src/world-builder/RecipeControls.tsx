import type { BuilderSession } from "./useBuilderSession";
import { download } from "./useBuilderSession";
import { useStudio } from "../studio/useStudio";
import { readWorldFiles } from "../director/world-files";

/** The open project's recipe (an agent's hand-off, a take's, an opened bundle's). */
function useProjectRecipe() {
  const bundle = useStudio((state) => state.director.bundle);
  try {
    return bundle ? readWorldFiles(bundle).recipe : undefined;
  } catch {
    return undefined;
  }
}

export function RecipeControls({ s }: { s: BuilderSession }) {
  const projectRecipe = useProjectRecipe();
  return (
    <>
      <p className="wb-hint">
        The complete set, camera, prompts, transforms and texture assignments.
        Reattach source media after loading.
      </p>
      <div className="wb-panel-actions">
        <button onClick={() => s.setJson(JSON.stringify(s.recipe, null, 2))}>
          Inspect JSON
        </button>
        <button
          onClick={() =>
            download(
              new Blob([JSON.stringify(s.recipe, null, 2)], {
                type: "application/json",
              }),
              "world-recipe.json",
            )
          }
        >
          Save recipe
        </button>
        {projectRecipe && (
          <button
            title="The recipe this project carries: the last one applied or captured, or the bundle's"
            onClick={() => s.run(() => s.api.current!.configure(projectRecipe))}
          >
            Load project recipe
          </button>
        )}
        <label className="wb-file-input">
          Load recipe
          <input
            aria-label="Load recipe"
            type="file"
            accept="application/json,.json"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file)
                s.run(
                  s.stopping(async () => {
                    if (file.size > 64000)
                      throw new Error("Recipe exceeds 64 KB.");
                    await s.api.current!.configure(
                      JSON.parse(await file.text()),
                    );
                  }),
                );
              ev.target.value = "";
            }}
          />
        </label>
      </div>
      <textarea
        aria-label="Scene recipe JSON"
        value={s.json}
        onChange={(ev) => s.setJson(ev.target.value)}
        rows={10}
      />
      <button
        onClick={() =>
          s.run(s.stopping(() => s.api.current!.configure(JSON.parse(s.json))))
        }
      >
        Apply JSON
      </button>
      <details className="wb-fold">
        <summary>Agent API</summary>
        <p className="wb-hint">
          window.directorScene exposes configure, getRecipe, render, capture,
          setSurface, clearSurface, setScreen and setAudio. Primitives and
          transforms use the same validated JSON as this interface.
        </p>
      </details>
    </>
  );
}
