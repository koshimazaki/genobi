import { useEffect, useRef, useState } from "react";
import ThemedSelect from "../components/ThemedSelect";
import { canonical } from "../../shared/memory/state";
import { errorText } from "./session-io";
import { validateRecipe, type Recipe } from "./recipe";
import { getDescentView, withDescentView } from "./story-camera";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import "./descent-view.css";

/** The same view/lens chooser works before loading and inside Camera. */
export function DescentViewControls({
  recipe,
  disabled = false,
  onChange,
}: {
  recipe: Recipe;
  disabled?: boolean;
  onChange: (recipe: Recipe) => void | Promise<unknown>;
}) {
  const view = getDescentView(recipe);
  return view ? (
    <ViewSettings
      recipe={recipe}
      view={view}
      disabled={disabled}
      onChange={onChange}
    />
  ) : null;
}

function ViewSettings({
  recipe,
  view,
  disabled,
  onChange,
}: {
  recipe: Recipe;
  view: "first-person" | "follow";
  disabled: boolean;
  onChange: (recipe: Recipe) => void | Promise<unknown>;
}) {
  const lens = recipe.cameraMotion!.keys[0].fov;
  const [draft, setDraft] = useState(lens);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => setDraft(lens), [recipe, lens]);
  const change = (create: () => Recipe) => {
    if (disabled || pending.current) return;
    pending.current = true;
    setWorking(true);
    setError("");
    void Promise.resolve()
      .then(create)
      .then(onChange)
      .catch((err: unknown) => {
        setError(errorText(err));
        setDraft(lens);
      })
      .finally(() => {
        pending.current = false;
        setWorking(false);
      });
  };
  const commitLens = (value: number) => {
    if (!Number.isFinite(value) || value < 15 || value > 100) {
      setDraft(lens);
      return;
    }
    if (recipe.cameraMotion!.keys.every((key) => key.fov === value)) return;
    change(() =>
      validateRecipe({
        ...recipe,
        fov: value,
        cameraMotion: {
          ...recipe.cameraMotion!,
          keys: recipe.cameraMotion!.keys.map((key) => ({
            ...key,
            fov: value,
          })),
        },
      }),
    );
  };
  return (
    <fieldset
      className="wb-descent-view"
      disabled={disabled || working}
      aria-label="Descent camera view"
    >
      <label>
        <span>Descent view</span>
        <ThemedSelect
          aria-label="Descent view"
          value={view}
          onChange={(event) => {
            const selected = event.target.value as typeof view;
            change(() => withDescentView(recipe, selected));
          }}
        >
          <option value="first-person">First person · looking down</option>
          <option value="follow">Follow the mannequin</option>
        </ThemedSelect>
      </label>
      <label className="wb-descent-lens">
        <span>FOV · whole move</span>
        <span>
          <input
            type="number"
            aria-label="Descent field of view"
            min={15}
            max={100}
            step={1}
            value={Number.isFinite(draft) ? draft : ""}
            onChange={(event) => setDraft(event.target.valueAsNumber)}
            onBlur={() => commitLens(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitLens(draft);
              }
              if (event.key === "Escape") setDraft(lens);
            }}
          />
          °
        </span>
      </label>
      <input
        type="range"
        aria-label="Descent FOV slider"
        min={15}
        max={100}
        step={1}
        value={Number.isFinite(draft) ? draft : lens}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={(event) => commitLens(Number(event.currentTarget.value))}
        onKeyUp={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            commitLens(Number(event.currentTarget.value));
        }}
        onBlur={(event) => commitLens(Number(event.currentTarget.value))}
        onPointerCancel={() => setDraft(lens)}
      />
      <p className="wb-hint">
        {view === "first-person"
          ? "Look down the shaft through the falling camera. The mannequin is hidden in this view."
          : "Watch the mannequin fall through the same spaces."}
      </p>
      {error && (
        <p className="wb-loop-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function DescentCameraControls({
  s,
  e,
}: {
  s: BuilderSession;
  e: WorldEditor;
}) {
  return (
    <DescentViewControls
      recipe={s.recipe}
      disabled={!s.ready || s.busy || s.capturing || e.mode === "walk"}
      onChange={(recipe) => {
        const api = s.api.current!;
        const expectedRevision = api.getRecipeRevision(),
          frame = s.frame;
        if (canonical(s.recipe) !== canonical(api.getRecipe()))
          throw new Error("The scene changed. Choose the view or FOV again.");
        e.chooseMode("shot", false);
        return s.run(async () => {
          await s.settled();
          await api.configure(recipe, { expectedRevision });
          await api.render(Math.min(frame, recipe.frames - 1));
        });
      }}
    />
  );
}
