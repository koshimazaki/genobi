import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { nearestSceneKey } from "./scene-editing";
import { SceneStatePreview } from "./SceneStatePreview";
import "./scene-motion.css";

export function SceneStateStrip({
  s,
  e,
  onControls,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onControls: () => void;
}) {
  const motion = s.recipe.motion;
  if (!motion) return null;
  const selected = nearestSceneKey(s.recipe, s.frame);
  return (
    <section className="wb-motion-strip" aria-label="Scene animation states">
      <header>
        <strong>Scene motion</strong>
        <span>
          {e.mode === "edit"
            ? `Editing ${motion.stateKeys[selected].label}`
            : "Choose a state to edit its shape"}
        </span>
        <button type="button" onClick={onControls}>
          Motion controls
        </button>
      </header>
      <div className="wb-state-cards">
        {motion.stateKeys.map((key, index) => (
          <button
            type="button"
            key={key.id}
            className="wb-state-card"
            disabled={!s.ready || s.busy || e.mode === "walk"}
            aria-pressed={e.mode === "edit" && selected === index}
            aria-label={`Edit state ${index + 1}: ${key.label}`}
            onClick={() => {
              e.editState(index);
              onControls();
            }}
          >
            <SceneStatePreview recipe={s.recipe} frame={key.frame} />
            <span>
              <b>{String(index + 1).padStart(2, "0")}</b>
              {key.label}
              <small>{(key.frame / s.recipe.fps).toFixed(2)} s</small>
            </span>
          </button>
        ))}
      </div>
      {e.mode === "edit" && (
        <p className="wb-hint">
          Move the selected shape with Build controls. Shot camera previews the
          authored movement and audio response.
        </p>
      )}
    </section>
  );
}
