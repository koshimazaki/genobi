import Icon from "../components/Icon";
import { shapes, shapeLabels } from "./scene-contract";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import "./primitive-picker.css";

/**
 * The primitives chooser: a small panel beside the tool rail's Add button.
 * It stays open while shapes are placed; Add, Escape or a press outside it
 * closes it (BuildToolbar listens at the document).
 */
export function PrimitivePicker({
  s,
  e,
  disabled,
  onClose,
}: {
  s: BuilderSession;
  e: WorldEditor;
  disabled: boolean;
  onClose: () => void;
}) {
  return (
    <div
      id="wb-primitive-picker"
      className="wb-primitive-picker"
      role="group"
      aria-label="Primitives"
    >
      <header>
        <h2>Primitives</h2>
        <small>{s.recipe.objects.length} / 24</small>
        <button aria-label="Close primitives" onClick={onClose}>
          <Icon name="close" size={12} />
        </button>
      </header>
      <fieldset disabled={disabled}>
        <div className="wb-primitive-grid">
          {shapes.map((shape) => (
            <button
              key={shape}
              disabled={s.recipe.objects.length >= 24}
              onClick={() =>
                s.run(async () => {
                  await e.add(shape);
                })
              }
            >
              <Icon
                name={
                  shape === "plane"
                    ? "image"
                    : shape === "box"
                      ? "grid"
                      : "plus"
                }
                size={16}
              />
              {shapeLabels[shape]}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="wb-hint">Place a shape, then move, rotate or stretch it.</p>
    </div>
  );
}
