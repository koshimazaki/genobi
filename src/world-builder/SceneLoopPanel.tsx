import type { ReactNode } from "react";
import Icon from "../components/Icon";
import ThemedSelect from "../components/ThemedSelect";
import { LoopDurationControl } from "./LoopDurationControl";
import { SceneLoopOptions } from "./SceneLoopOptions";
import { SceneSizeControls } from "./SceneSizeControls";
import { SceneStatePreview } from "./SceneStatePreview";
import { SCENE_LOOP_SLOTS, type SceneLoopSlot } from "./scene-loop";
import type { BuilderSession } from "./useBuilderSession";
import { useSceneLoop, type SceneLoopCameraSelection } from "./useSceneLoop";
import type { WorldEditor } from "./useWorldEditor";
import "./scene-motion.css";
import "./scene-loop-panel.css";

export function SceneLoopPanel({
  s,
  e,
  onCamera,
  onSound,
  onSaveLoop,
  cameraSelection,
  settings,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onCamera: () => void;
  onSound: () => void;
  onSaveLoop: (name: string) => Promise<void>;
  cameraSelection?: SceneLoopCameraSelection;
  settings?: ReactNode;
}) {
  const loop = useSceneLoop(s, e, onSaveLoop, cameraSelection),
    letter = SCENE_LOOP_SLOTS[loop.active],
    saved = loop.bank.slots[loop.active];
  return (
    <section
      className="wb-loop-panel"
      aria-label="Loop panel"
      onKeyDown={(event) => {
        if ([" ", "Delete", "Backspace"].includes(event.key))
          event.stopPropagation();
      }}
    >
      <header>
        <h2>
          <Icon name="loop" size={16} /> Loop
        </h2>
        <span>{loop.filled} / 4 saved</span>
        {loop.visible < 4 && (
          <button
            type="button"
            className="wb-loop-add"
            disabled={loop.locked}
            onClick={loop.add}
            aria-label={`Add slot ${SCENE_LOOP_SLOTS[loop.visible]}`}
          >
            + {SCENE_LOOP_SLOTS[loop.visible]}
          </button>
        )}
      </header>
      <div
        className="wb-loop-slots"
        role="group"
        aria-label="Saved loop views"
        style={{
          gridTemplateColumns: `repeat(${loop.visible}, minmax(0, 1fr))`,
        }}
      >
        {loop.bank.slots.slice(0, loop.visible).map((slot, index) => {
          const name = SCENE_LOOP_SLOTS[index];
          return (
            <button
              key={name}
              type="button"
              className="wb-loop-slot"
              aria-label={`Loop slot ${name}: ${slot ? slot.label : "empty"}`}
              aria-pressed={index === loop.active}
              disabled={loop.locked}
              data-filled={Boolean(slot)}
              title={
                slot
                  ? `Recall ${name}: ${slot.label}`
                  : `Choose ${name} as the next save destination`
              }
              onClick={() => loop.select(index as SceneLoopSlot)}
            >
              {slot ? (
                <SceneStatePreview recipe={slot.recipe} frame={0} />
              ) : (
                <span className="wb-loop-empty">
                  <Icon name="plus" size={16} />
                </span>
              )}
              <span className="wb-loop-slot-label">
                <b>{name}</b>
                <span>{slot ? slot.label : "Empty"}</span>
                {slot && <Icon name="check" size={10} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="wb-loop-save-view">
        <button
          type="button"
          aria-label={`Save ${letter}`}
          disabled={loop.locked}
          onClick={loop.save}
        >
          <Icon name="camera" size={14} /> Save {letter}
          <small>{saved ? "Replace view" : "Shape + camera"}</small>
        </button>
        {saved && (
          <button
            type="button"
            className="wb-loop-clear"
            aria-label={`Clear loop slot ${letter}`}
            title={`Clear ${letter}`}
            disabled={loop.locked}
            onClick={loop.clear}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      <p className="wb-loop-guidance">
        {loop.filled === 0
          ? "Frame the scene, then Save A. Choose the next asset below."
          : loop.filled === 1
            ? `Choose another asset below, then save it to ${letter}.`
            : `${loop.startLetter} sets the stage; objects and cameras morph. Includes return to ${loop.startLetter}.`}
      </p>
      {settings}
      <SceneSizeControls s={s} disabled={loop.locked || e.mode === "walk"} />
      <LoopDurationControl
        frames={loop.frames}
        disabled={loop.locked}
        onChange={loop.setFrames}
      />
      <label className="wb-loop-field">
        Morph algorithm
        <ThemedSelect
          aria-label="Loop morph algorithm"
          disabled={loop.locked}
          value={loop.style}
          onChange={(event) =>
            loop.setStyle(event.target.value as typeof loop.style)
          }
        >
          <option value="direct">Direct</option>
          <option value="scatter">Scatter</option>
          <option value="twist">Twist</option>
          <option value="assemble">Assemble</option>
        </ThemedSelect>
      </label>
      <div className="wb-loop-actions">
        <button
          type="button"
          className="wb-loop-play"
          disabled={loop.locked || (!s.playing && loop.filled < 2)}
          onClick={loop.play}
        >
          <Icon name={s.playing ? "pause" : "play"} size={13} />
          {s.playing ? "Pause loop" : "Play loop"}
        </button>
        <button
          type="button"
          disabled={loop.locked || loop.filled < 2 || s.previewOnly}
          onClick={loop.saveLoop}
          title={
            s.previewOnly
              ? "Capture needs WebGL"
              : "Capture this loop into Takes"
          }
        >
          <Icon name="film" size={13} /> Save loop
        </button>
      </div>
      {s.previewOnly && (
        <p className="wb-hint">
          Geometry preview is available. Saving video needs WebGL.
        </p>
      )}
      {loop.working && (
        <div className="wb-loop-progress" role="status">
          <span>
            {loop.working}
            {s.capturing ? ` · ${s.progress}/${s.recipe.frames} frames` : "…"}
          </span>
          {s.capturing && (
            <button type="button" onClick={() => s.api.current?.cancel()}>
              Cancel save
            </button>
          )}
        </div>
      )}
      {loop.error && (
        <p className="wb-loop-error" role="alert">
          {loop.error}
        </p>
      )}
      {loop.notice && (
        <p className="wb-loop-notice" role="status">
          {loop.notice}
        </p>
      )}
      <SceneLoopOptions
        loop={loop}
        s={s}
        onCamera={onCamera}
        onSound={onSound}
      />
    </section>
  );
}
