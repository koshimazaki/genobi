import { useEffect, useRef, useState } from "react";
import { openModal } from "../components/useModalDialog";
import { OriginalMovementGlyph } from "./MovementGlyph";
import { movementGlyph, movementPresets } from "./movement-presets";
import "./movement-menu.css";

/** One overlay picker, shared by the board and the inspector. */
export function MovementMenu({
  kind,
  value,
  onChange,
  disabled,
  label,
  number,
}: {
  kind: "camera" | "action";
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label?: string;
  number?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) return openModal(dialog.current);
  }, [open]);
  const title = kind === "camera" ? "Camera direction" : "Character action";
  function choose(next: string) {
    onChange(next);
    dialog.current?.close();
  }
  return (
    <div
      className="scroll-movement-menu"
      data-kind={kind}
      data-compact={!!number}
    >
      {!number && <span>{kind === "camera" ? "Camera" : "Action"}</span>}
      <button
        className="scroll-direction-trigger"
        aria-label={label ?? `${title}: ${value || "Choose direction"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        {number && <small>{number}</small>}
        <MovementGlyph
          text={value || (kind === "camera" ? "Locked" : "Hold")}
        />
        <span>{value || (kind === "camera" ? "Locked" : "Hold")}</span>
      </button>
      {open && (
        <dialog
          onClose={() => setOpen(false)}
          className="camera-dialog scroll-direction-dialog"
          ref={dialog}
          aria-label={title}
        >
          <header>
            <div>
              <h2>{title}</h2>
              <p>
                {number ? `Cell ${number} · ` : ""}Choose a preset or describe
                your own.
              </p>
            </div>
            <button
              onClick={() => dialog.current?.close()}
              aria-label={`Close ${title.toLowerCase()}`}
            >
              ×
            </button>
          </header>
          <div className="camera-dialog-body">
            <div
              className="scroll-movement-options"
              role="group"
              aria-label={`${kind} presets`}
            >
              {movementPresets[kind].map(([name, variant]) => (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  aria-pressed={value.toLowerCase() === name.toLowerCase()}
                  onClick={() => choose(name)}
                >
                  <OriginalMovementGlyph variant={variant} size={42} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <label className="scroll-movement-custom">
              Custom direction
              <input
                value={draft}
                maxLength={300}
                disabled={disabled}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Describe the movement…"
              />
            </label>
          </div>
          <div className="camera-dialog-actions">
            <button
              className="scroll-primary"
              disabled={disabled}
              onClick={() => choose(draft)}
            >
              Done
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
export function MovementGlyph({ text }: { text: string }) {
  const variant = movementGlyph(text);
  return variant ? (
    <span className="scroll-movement-glyph">
      <OriginalMovementGlyph variant={variant} />
    </span>
  ) : null;
}
