import { useMemo, useState } from "react";
import {
  MORPH_ASSETS,
  createMorphComposition,
  type MorphCompositionOptions,
} from "./morph-asset-catalogue";
import { MorphAssetPicker, MORPH_LETTERS } from "./MorphAssetPicker";
import { SceneStatePreview } from "./SceneStatePreview";
import { useMorphDraftPlayback } from "./useMorphDraftPlayback";
import {
  MOVE_SECONDS,
  TAKE_FPS,
  TAKE_FRAMES,
  framesForSeconds,
  takeSeconds,
} from "./take-duration";
import type { Recipe } from "./recipe";
import "./morph-composer.css";

/** Individual forms compose a new scene; choosing and previewing never applies it. */
export function MorphComposer({
  load,
  disabled,
  close,
  active = true,
}: {
  load: (recipe: Recipe) => void;
  disabled: boolean;
  close: () => void;
  active?: boolean;
}) {
  const [assetIds, setAssets] = useState(["pyramid", "cathedral"]);
  const [count, setCount] = useState<MorphCompositionOptions["count"]>(64);
  const [style, setStyle] =
    useState<MorphCompositionOptions["style"]>("direct");
  const [duration, setDuration] = useState("8");
  const durationFrames =
    Number.isFinite(Number(duration)) && duration.trim()
      ? framesForSeconds(Number(duration))
      : TAKE_FRAMES.min;
  const draft = useMemo(() => {
    if (assetIds.length < 2) return { recipe: null, error: "" };
    try {
      const durationSeconds = Number(duration);
      if (
        !duration.trim() ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < MOVE_SECONDS.min ||
        durationSeconds > MOVE_SECONDS.max
      )
        throw new Error(
          `Choose a total morph time from ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)} seconds.`,
        );
      return {
        recipe: createMorphComposition({
          assetIds,
          count,
          style,
          durationSeconds,
        }),
        error: "",
      };
    } catch (error) {
      return {
        recipe: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [assetIds, count, style, duration]);
  const recipe = draft.recipe;
  const preview = useMorphDraftPlayback(recipe, active);
  const reorder = (index: number, offset: number) => {
    const next = [...assetIds];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setAssets(next);
  };
  return (
    <section
      className="wb-morph-composer"
      aria-label="Build a morph"
      onKeyDown={(event) => {
        if (["Space", "Delete", "Backspace"].includes(event.code))
          event.stopPropagation();
      }}
    >
      <header>
        <div>
          <span className="preset-eyebrow">YOUR OWN SEQUENCE</span>
          <h3>Build a morph</h3>
        </div>
        <button type="button" onClick={close}>
          Back to presets
        </button>
      </header>
      <p>
        Choose forms, arrange A–D, then preview the movement before loading.
      </p>
      <MorphAssetPicker selected={assetIds} change={setAssets} />
      {assetIds.length > 0 && (
        <div
          className="wb-morph-forms"
          role="group"
          aria-label="Morph form order"
        >
          {assetIds.map((id, index) => (
            <article className="wb-morph-form" key={id}>
              <div className="wb-morph-form-heading">
                <span>{MORPH_LETTERS[index]}</span>
                <strong>
                  {MORPH_ASSETS.find((asset) => asset.id === id)!.name}
                </strong>
                <small>
                  {index === 0
                    ? "From"
                    : index === assetIds.length - 1
                      ? "To"
                      : "Through"}
                </small>
              </div>
              <div className="wb-morph-order">
                <button
                  type="button"
                  aria-label={`Move form ${MORPH_LETTERS[index]} earlier`}
                  disabled={index === 0}
                  onClick={() => reorder(index, -1)}
                >
                  ← Earlier
                </button>
                <button
                  type="button"
                  aria-label={`Move form ${MORPH_LETTERS[index]} later`}
                  disabled={index === assetIds.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  Later →
                </button>
                <button
                  type="button"
                  aria-label={`Remove form ${MORPH_LETTERS[index]}`}
                  onClick={() =>
                    setAssets(assetIds.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="wb-morph-composer-bottom">
        <div className="wb-morph-draft-preview">
          {recipe ? (
            <>
              <SceneStatePreview recipe={recipe} frame={preview.frame} />
              <div className="wb-morph-preview-transport">
                <button
                  type="button"
                  aria-label={
                    preview.playing ? "Pause morph draft" : "Play morph draft"
                  }
                  onClick={preview.toggle}
                >
                  {preview.playing ? "Pause preview" : "Play preview"}
                </button>
                <output>
                  {(preview.frame / recipe.fps).toFixed(1)} /{" "}
                  {((recipe.frames - 1) / recipe.fps).toFixed(1)} s
                </output>
              </div>
              <label className="wb-morph-preview-slider">
                <span>
                  Scrub draft{" "}
                  <output>{Math.round(preview.position * 100)}%</output>
                </span>
                <input
                  aria-label="Morph composition preview"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={preview.position}
                  onChange={(event) => preview.seek(Number(event.target.value))}
                />
              </label>
              <p className="effect-note">
                Draft geometry preview · your current 3D scene stays loaded.
              </p>
            </>
          ) : (
            <div className="wb-morph-draft-empty">
              {assetIds.length < 2
                ? "Tick at least two forms to preview a morph."
                : "Adjust the sequence to preview it."}
            </div>
          )}
        </div>
        <div className="wb-morph-compose-settings">
          <div className="wb-morph-duration">
            <label>
              Total morph time · seconds
              <input
                type="number"
                inputMode="decimal"
                aria-label="Total morph time"
                min={MOVE_SECONDS.min}
                max={MOVE_SECONDS.max}
                step="any"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
            <input
              type="range"
              aria-label="Total morph time slider"
              aria-valuetext={`${takeSeconds(durationFrames).toFixed(4)} seconds, ${durationFrames} frames`}
              min={TAKE_FRAMES.min}
              max={TAKE_FRAMES.max}
              step={TAKE_FRAMES.step}
              value={durationFrames}
              onChange={(event) =>
                setDuration(
                  String(
                    Math.floor(takeSeconds(Number(event.target.value)) * 1000) /
                      1000,
                  ),
                )
              }
            />
            <output>
              {durationFrames} frames at {TAKE_FPS} fps ·{" "}
              {takeSeconds(durationFrames).toFixed(4)} s actual
            </output>
            <small>
              LTX frame grid · 8k + 1. Each slider step changes eight frames.
            </small>
          </div>
          <label>
            Morph algorithm
            <select
              aria-label="Morph transition style"
              value={style}
              onChange={(event) =>
                setStyle(event.target.value as MorphCompositionOptions["style"])
              }
            >
              <option value="direct">Direct</option>
              <option value="scatter">Scatter</option>
              <option value="twist">Twist</option>
              <option value="assemble">Assemble</option>
            </select>
          </label>
          <label>
            Detail
            <select
              aria-label="Morph composition detail"
              value={count}
              onChange={(event) =>
                setCount(
                  Number(
                    event.target.value,
                  ) as MorphCompositionOptions["count"],
                )
              }
            >
              {[64, 128, 256].map((value) => (
                <option value={value} key={value}>
                  {value} retained parts
                </option>
              ))}
            </select>
          </label>
          <p className="effect-note">
            Time covers the complete sequence. More parts preserve finer
            features; the count stays fixed through every form.
          </p>
          <button
            className="effect-primary"
            type="button"
            disabled={disabled || !recipe}
            onClick={() => recipe && load(recipe)}
          >
            Load morph
          </button>
          <p className="effect-note">
            Load to edit camera and music response in 3D. Then use Save scene to
            keep this sequence.
          </p>
        </div>
      </div>
      {draft.error && (
        <p className="effect-error" role="alert">
          {draft.error} Your choices are kept.
        </p>
      )}
    </section>
  );
}
