import { useEffect, useMemo, useRef, useState } from "react";
import ThemedSelect from "../components/ThemedSelect";
import { resizeScene, sceneMetres, sceneSizeBounds } from "./scene-size";
import type { BuilderSession } from "./useBuilderSession";
import "./scene-size.css";

/** A size edit owns one revision and keeps the playhead at the inspected moment. */
export async function commitSceneSize(s: BuilderSession, factor: number) {
  const api = s.api.current;
  if (!api) throw new Error("The scene is still starting.");
  const expectedRevision = api.getRecipeRevision();
  const recipe = api.getRecipe();
  const frame = s.runtime.current?.frame ?? s.frame;
  s.setPlaying(false);
  await s.settled();
  if (s.api.current !== api) throw new Error("The scene changed. Try again.");
  const next = resizeScene(recipe, factor);
  await api.configure(next, { expectedRevision });
  await api.render(Math.min(frame, next.frames - 1));
}

/** Metres are baked into the recipe; the human reference is never scaled. */
export function SceneSizeControls({
  s,
  disabled = false,
}: {
  s: BuilderSession;
  disabled?: boolean;
}) {
  return s.recipe.scene === "stage" ? (
    <StageSizeControls s={s} disabled={disabled} />
  ) : null;
}

function StageSizeControls({
  s,
  disabled,
}: {
  s: BuilderSession;
  disabled: boolean;
}) {
  const factor = s.recipe.sceneSize?.factor ?? 1;
  const [draft, setDraft] = useState(String(factor));
  const [working, setWorking] = useState(false);
  const pending = useRef(false);
  useEffect(() => setDraft(String(factor)), [s.recipe, factor]);
  const bounds = useMemo(() => sceneSizeBounds(s.recipe), [s.recipe]);
  const metres = useMemo(
    () => sceneMetres(s.recipe, s.frame),
    [s.recipe, s.frame],
  );
  const locked = disabled || working || !s.ready || s.busy || s.capturing;
  const commit = (text = draft) => {
    if (pending.current || locked) return;
    const next = Number(text);
    if (next === factor) return;
    pending.current = true;
    setWorking(true);
    void s
      .run(() => commitSceneSize(s, next))
      .then((ok) => {
        if (!ok) setDraft(String(factor));
      })
      .finally(() => {
        pending.current = false;
        setWorking(false);
      });
  };
  const value = Number(draft);
  const dimensions = (metres.roomDimensions ?? metres.dimensions)
    .map((n) => n.toFixed(n < 10 ? 1 : 0))
    .join(" × ");
  return (
    <div className="wb-scene-size" role="group" aria-label="Scene size">
      <label>
        <span>Scene size</span>
        <span className="wb-scene-size-value">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Scene size multiplier"
            value={draft}
            disabled={locked}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") setDraft(String(factor));
            }}
          />
          <span>×</span>
        </span>
      </label>
      <input
        type="range"
        aria-label="Scene size slider"
        aria-valuetext={`${factor} times original size; mannequin stays 1.8 metres`}
        min={bounds.min}
        max={bounds.max}
        step="any"
        value={Number.isFinite(value) ? value : factor}
        disabled={locked || bounds.min === bounds.max}
        onChange={(event) => setDraft(event.target.value)}
        onPointerUp={(event) => commit(event.currentTarget.value)}
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
            commit(event.currentTarget.value);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onPointerCancel={() => setDraft(String(factor))}
      />
      <ThemedSelect
        className="wb-scene-size-preset"
        aria-label="Scene size preset"
        value={[0.5, 1, 2].includes(factor) ? String(factor) : "custom"}
        disabled={locked}
        onChange={(event) => commit(event.target.value)}
      >
        {![0.5, 1, 2].includes(factor) && (
          <option value="custom" disabled>
            Custom · {factor.toFixed(2)}×
          </option>
        )}
        {[
          [0.5, "Small"],
          [1, "Original"],
          [2, "Large"],
        ].map(([amount, label]) => (
          <option
            key={amount}
            value={amount}
            disabled={
              locked ||
              Number(amount) < bounds.min ||
              Number(amount) > bounds.max
            }
          >
            {label} · {amount}×
          </option>
        ))}
      </ThemedSelect>
      <output aria-live="off">
        {dimensions} m · {metres.roomDimensions ? "active room" : "set bounds"}
      </output>
      <span className="wb-hint">
        Mannequin stays 1.8 m. Camera and rooms resize together.
      </span>
    </div>
  );
}
