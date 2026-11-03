import { useMemo, useState } from "react";
import { SceneStatePreview } from "./SceneStatePreview";
import type { ScenePreset } from "./world-presets";
import { validateRecipe } from "./recipe";
import { reconcileDuration, TAKE_FRAMES } from "./take-duration";
import { createMotionPreset } from "./motion-presets";
import { DescentViewControls } from "./DescentViewControls";

const DETAIL_GROUPS = [
  {
    label: "Fruit detail",
    unit: "voxels",
    options: [
      { id: "fruit-morph", count: 96 },
      { id: "fruit-morph-fine", count: 192 },
    ],
  },
  {
    label: "Architecture detail",
    unit: "parts",
    options: [
      { id: "voxel-architecture", count: 64 },
      { id: "voxel-architecture-128", count: 128 },
      { id: "voxel-architecture-256", count: 256 },
    ],
  },
] as const;

export function ScenePresetDetail({
  preset,
  disabled,
  load,
  remove,
  configure,
}: {
  preset: ScenePreset;
  disabled: boolean;
  load: (preset: ScenePreset) => void;
  remove?: () => void;
  configure?: () => void;
}) {
  const [frames, setFrames] = useState(preset.recipe.frames);
  const [background, setBackground] = useState(preset.recipe.background);
  const [stageLook, setStageLook] = useState(
    preset.recipe.stageLook ?? "studio",
  );
  const [stateIndex, setStateIndex] = useState(0);
  const [base, setBase] = useState(preset.recipe);
  const detail = DETAIL_GROUPS.find((group) =>
    group.options.some((option) => option.id === preset.file),
  );
  const recipe = useMemo(
    () =>
      validateRecipe(
        reconcileDuration(base, {
          ...base,
          frames,
          seconds: frames / base.fps,
          background,
          stageLook,
        }),
      ),
    [base, frames, background, stageLook],
  );
  const states = recipe.motion?.stateKeys;
  const frame = states?.[stateIndex]?.frame ?? 0;
  return (
    <section
      className="preset-scene-detail"
      aria-label={`Configure ${preset.name}`}
    >
      <div className="preset-scene-visual">
        <SceneStatePreview recipe={recipe} frame={frame} />
        {states && (
          <div
            className="preset-scene-states"
            role="group"
            aria-label="Preview scene state"
          >
            {states.map((state, index) => (
              <button
                type="button"
                key={state.id}
                aria-pressed={index === stateIndex}
                onClick={() => setStateIndex(index)}
              >
                {String(index + 1).padStart(2, "0")} {state.label}
              </button>
            ))}
          </div>
        )}
        <p className="effect-preview-caption">
          Geometry preview · selecting a card keeps the current scene
        </p>
      </div>
      <div className="preset-scene-settings">
        <div className="effect-tags">
          <span>{states ? "Scene motion" : "3D scene"}</span>
          <span>{preset.source === "saved" ? "Your preset" : "Built-in"}</span>
        </div>
        <h3>{preset.name}</h3>
        <p>
          {detail
            ? `${states?.map((state) => state.label).join(" → ")} · ${base.motion?.instances?.count} retained ${detail.unit}`
            : preset.summary}
        </p>
        <div className="effect-controls">
          <DescentViewControls
            recipe={recipe}
            disabled={disabled}
            onChange={setBase}
          />
          {detail && (
            <label className="effect-control">
              <span>{detail.label}</span>
              <select
                aria-label={detail.label}
                value={
                  detail.options.find(
                    (option) => option.count === base.motion?.instances?.count,
                  )?.id ?? preset.file
                }
                onChange={(e) => setBase(createMotionPreset(e.target.value))}
              >
                {detail.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.count} {detail.unit}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="effect-control">
            <span>
              Duration <output>{(frames / recipe.fps).toFixed(2)} s</output>
            </span>
            <input
              type="range"
              aria-label="Preset duration"
              min={TAKE_FRAMES.min}
              max={TAKE_FRAMES.max}
              step={TAKE_FRAMES.step}
              value={frames}
              onChange={(e) => setFrames(Number(e.target.value))}
            />
          </label>
          <label className="effect-control effect-control-color">
            <span>Background</span>
            <input
              type="color"
              aria-label="Preset background"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </label>
          <label className="effect-control">
            <span>Floor</span>
            <select
              aria-label="Preset floor"
              value={stageLook}
              onChange={(e) =>
                setStageLook(e.target.value as "studio" | "dark-grid")
              }
            >
              <option value="dark-grid">Dark grid</option>
              <option value="studio">Studio</option>
            </select>
          </label>
        </div>
        <p className="effect-note">
          Load to edit objects, camera
          {states ? ", states and audio response" : " and sound"} in the 3D
          controls. Your current soundtrack stays attached.
        </p>
        <div className="preset-detail-actions">
          <button
            type="button"
            className="effect-primary"
            disabled={disabled}
            onClick={() => load({ ...preset, recipe })}
          >
            Load scene
          </button>
          {configure && (
            <button type="button" onClick={configure}>
              Scene controls
            </button>
          )}
          {remove && (
            <button type="button" disabled={disabled} onClick={remove}>
              Remove saved preset
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
