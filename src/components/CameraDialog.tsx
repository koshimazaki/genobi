import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cameraClauses,
  isLtxModel,
  type CameraSelection,
  type CameraEdits,
} from "../../shared/camera";
import {
  emptyLight,
  lightSentences,
  LIGHT_EDIT_LIMIT,
  type LightEdits,
  type LightSelection,
} from "../../shared/light";
import type { VideoModel } from "../../shared/types";
import CameraPanel from "./CameraPanel";
import Icon from "./Icon";
import PromptField from "./PromptField";
import { openModal } from "./useModalDialog";

/** One editable sentence under the panel, in its part's colour. */
interface Line {
  key: string;
  id: string;
  label: string;
  color: string;
  text: string;
  maxLength: number;
  onChange: (text: string) => void;
}

export default function CameraDialog({
  selected,
  edits,
  model,
  still = false,
  light = emptyLight,
  lightEdits = {},
  onApply,
  onClose,
}: {
  selected: CameraSelection;
  edits: CameraEdits;
  model: VideoModel;
  /**
   * The composer holds a still (an image entry), decided by the caller from
   * the generator: FLUX 3 makes both, so the model alone cannot say.
   */
  still?: boolean;
  /** LTX video only: the Light picker's choice and its edited sentences. */
  light?: LightSelection;
  lightEdits?: LightEdits;
  onApply: (choice: {
    camera: CameraSelection;
    cameraEdits: CameraEdits;
    light: LightSelection;
    lightEdits: LightEdits;
  }) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [phrases, setPhrases] = useState(edits);
  const [lightDraft, setLightDraft] = useState(light);
  const [lightPhrases, setLightPhrases] = useState(lightEdits);
  // Light is LTX's, and a still has none: FLUX keeps its three sections.
  const showLight = isLtxModel(model) && !still;
  // A still keeps the framing and not the movement: the panel shows no
  // movement, and the held one is kept untouched for the next video run.
  const shown = still ? { ...draft, movements: null } : draft;
  const camera: Line[] = cameraClauses(shown, phrases, model).map(
    ({ section, term, text }) => ({
      key: term.id,
      id: `phrase-${section.id}`,
      label: section.label,
      color: section.color,
      text,
      maxLength: 600,
      onChange: (value) => setPhrases({ ...phrases, [term.id]: value }),
    }),
  );
  const lights: Line[] = showLight
    ? lightSentences(lightDraft, lightPhrases).map(({ group, term, text }) => ({
        key: term.id,
        id: `phrase-light-${group.id}`,
        label: group.label,
        color: "--camera-light",
        text,
        maxLength: LIGHT_EDIT_LIMIT,
        onChange: (value) =>
          setLightPhrases({ ...lightPhrases, [term.id]: value }),
      }))
    : [];
  // The LTX guide's order: shot and angle, light, then movement.
  const movement = camera.findIndex((line) => line.id === "phrase-movements");
  const lines =
    movement < 0
      ? [...camera, ...lights]
      : [...camera.slice(0, movement), ...lights, ...camera.slice(movement)];
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const close = openModal(dialog.current);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="camera-dialog"
      aria-labelledby="camera-heading"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <div>
          <h2 id="camera-heading">Camera controls</h2>
          <p>
            {still
              ? "A still keeps shot size and angle. Movement is for video."
              : "Choose any combination. Leave the rest at None."}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Cancel camera changes"
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="camera-dialog-body">
        <CameraPanel
          selected={shown}
          onSelect={(next) =>
            setDraft(still ? { ...next, movements: draft.movements } : next)
          }
          model={model}
          still={still}
          light={showLight ? lightDraft : undefined}
          onLight={showLight ? setLightDraft : undefined}
        />
        {lines.length > 0 && (
          <div
            className="camera-phrases"
            role="group"
            aria-label="Camera prompt"
          >
            {lines.map((line) => (
              <div
                className="camera-phrase-line"
                key={line.key}
                style={
                  { "--section-color": `var(${line.color})` } as CSSProperties
                }
              >
                <PromptField
                  id={line.id}
                  label={line.label}
                  labelClassName="camera-phrase-label"
                  value={line.text}
                  maxLength={line.maxLength}
                  placeholder="Add camera direction…"
                  onChange={line.onChange}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="camera-dialog-actions">
        <button className="text-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          onClick={() =>
            onApply({
              camera: draft,
              cameraEdits: phrases,
              light: lightDraft,
              lightEdits: lightPhrases,
            })
          }
        >
          Done <Icon name="arrow" size={16} />
        </button>
      </div>
    </dialog>
  );
}
