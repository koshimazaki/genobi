import { useRef, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { nearestSceneKey } from "./scene-editing";
import { captureSceneState } from "./scene-state-snapshot";
import { SceneStateAudioControls } from "./SceneStateAudioControls";
import { SceneStatePreview } from "./SceneStatePreview";
import "./scene-motion.css";

export function SceneStateStrip({
  s,
  e,
  onControls,
  onCamera,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onControls: () => void;
  onCamera?: () => void;
}) {
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    pending = useRef(false),
    motion = s.recipe.motion,
    keys = motion?.stateKeys ?? [],
    selected = nearestSceneKey(s.recipe, s.frame),
    disabled = !s.ready || s.busy || saving || e.mode === "walk";
  if (s.recipe.scene === "neuro") return null;
  const save = (index: number, targetStateId?: string) => {
    if (disabled || pending.current) return;
    pending.current = true;
    setSaving(true);
    setNotice("");
    void s
      .run(async () => {
        const editor = s.runtime.current?.editor;
        if (editor?.dragging)
          throw new Error("Finish moving the object before saving a state.");
        // Read the visible view before Shot replaces the free Build camera.
        const camera = editor?.cameraPose(),
          frame = s.frame,
          editing = e.mode === "edit";
        s.setPlaying(false);
        await s.settled();
        const current = s.api.current!.getRecipe(),
          letter = String.fromCharCode(65 + index),
          next = captureSceneState(current, frame, {
            ...(targetStateId
              ? { targetStateId }
              : { label: `State ${letter}` }),
            camera,
            editing,
          }),
          saved = targetStateId
            ? next.motion!.stateKeys.find((key) => key.id === targetStateId)!
            : next.motion!.stateKeys.at(-1)!;
        e.chooseMode("shot", false);
        if (await s.change(next)) {
          await s.api.current!.render(saved.frame);
          setNotice(`Saved shape and camera as ${letter}.`);
        }
      })
      .finally(() => {
        pending.current = false;
        setSaving(false);
      });
  };
  return (
    <section className="wb-motion-strip" aria-label="Scene animation states">
      <header>
        <strong>Scene motion</strong>
        <span>
          {e.mode === "edit"
            ? `Editing ${keys[selected]?.label ?? "current shape"}`
            : "Save a shape and camera together"}
        </span>
        <button type="button" onClick={onControls}>
          Motion controls
        </button>
        {onCamera && (
          <button type="button" onClick={onCamera}>
            Camera & audio
          </button>
        )}
      </header>
      <div className="wb-state-cards">
        {keys.map((key, index) => (
          <article
            key={key.id}
            className="wb-state-card"
            data-selected={e.mode === "edit" && selected === index}
            aria-label={`State ${String.fromCharCode(65 + index)}: ${key.label}`}
          >
            <SceneStatePreview recipe={s.recipe} frame={key.frame} />
            <span>
              <b>{String.fromCharCode(65 + index)}</b>
              <span title={key.label}>{key.label}</span>
              <small>{(key.frame / s.recipe.fps).toFixed(2)} s</small>
            </span>
            <div className="wb-state-actions">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={e.mode === "edit" && selected === index}
                aria-label={`Edit state ${String.fromCharCode(65 + index)}: ${key.label}`}
                onClick={() => {
                  e.editState(index);
                  onControls();
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => save(index, key.id)}
              >
                Save current as {String.fromCharCode(65 + index)}
              </button>
            </div>
          </article>
        ))}
        {keys.length < 4 && (
          <button
            type="button"
            className="wb-state-add"
            disabled={disabled}
            aria-label={
              keys.length
                ? `Add state ${String.fromCharCode(65 + keys.length)}`
                : "Save current as A"
            }
            onClick={() => save(keys.length)}
          >
            {keys.length
              ? `Add state ${String.fromCharCode(65 + keys.length)}`
              : "Save current as A"}
            <small>Current shape + camera</small>
          </button>
        )}
      </div>
      <p className="wb-hint">
        Add the next state before changing its objects to keep the earlier
        shape. Edit in Build, then save the current shape and camera to a
        letter. Music stays dynamic. Up to four states share the same objects;
        loading another scene replaces this sequence.
      </p>
      {notice && <p role="status">{notice}</p>}
      <SceneStateAudioControls s={s} disabled={disabled} />
    </section>
  );
}
