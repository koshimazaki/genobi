import { useState } from "react";
import type { Layer } from "../../shared/director/types";
import { emptyCamera } from "../../shared/camera";
import {
  LENSES,
  SHOT_TYPES,
  SUBJECT_ACTIONS,
  type DirectionsPatch,
} from "../../shared/director/directions";
import AnchoredPopover from "../components/AnchoredPopover";
import Icon from "../components/Icon";
import { MovementGlyph } from "../components/MovementGlyph";
import { MOVEMENT_GLYPHS, MOVEMENT_TERMS } from "./DirectionGlyph";
import { shotCode } from "./ShotCell";
import "./direction-popover.css";

/** Which direction picker is open, for which clip, opened from which cell. */
export interface DirectionPick {
  view: "shot" | "camera" | "action";
  layer: string;
  anchor: HTMLElement;
}
const TITLES = {
  shot: "Shot & lens",
  camera: "Camera movement",
  action: "Subject action",
} as const;

/**
 * The visual direction picker at the clicked cell: glyph and label choices
 * for camera movement and subject action, chips for shot type and lens. A
 * choice runs `set-clip-directions`, the command an agent sends, so it is
 * one Undo step and never touches the clip's own prompt text. Choosing the
 * current value again clears it. Lens labels are creative direction, not
 * calibrated optics or a model parameter.
 */
export default function DirectionPopover({
  pick,
  layer,
  index,
  locked,
  apply,
  close,
}: {
  pick: DirectionPick;
  layer: Layer;
  /** The shot's place on the storyboard, for its code. */
  index: number;
  locked: boolean;
  apply: (patch: DirectionsPatch) => string;
  close: () => void;
}) {
  const d = layer.directions ?? {};
  const [error, setError] = useState("");
  const set = (patch: DirectionsPatch, finish = false) => {
    const refused = apply(patch);
    setError(refused);
    if (refused || !finish) return;
    close();
    if (pick.anchor.isConnected) pick.anchor.focus();
  };
  const movement = pick.view !== "shot";
  const choices =
    pick.view === "camera"
      ? MOVEMENT_TERMS.map((t) => ({
          id: t.id,
          label: t.label,
          title: t.description,
          glyph: MOVEMENT_GLYPHS[t.id] ?? "linear",
          on: d.camera?.movements === t.id,
          patch: {
            camera: {
              ...emptyCamera,
              ...d.camera,
              movements: d.camera?.movements === t.id ? null : t.id,
            },
          } as DirectionsPatch,
        }))
      : SUBJECT_ACTIONS.map((a) => ({
          id: a.id,
          label: a.label,
          title: a.label,
          glyph: a.id,
          on: d.action === a.id,
          patch: { action: d.action === a.id ? null : a.id } as DirectionsPatch,
        }));
  return (
    <AnchoredPopover
      anchor={pick.anchor}
      label={`${TITLES[pick.view]} for ${layer.name}`}
      close={close}
      columns={movement ? 4 : undefined}
      className={`dir-direction-popover is-${pick.view}`}
    >
      <header>
        <strong>{TITLES[pick.view]}</strong>
        <span>
          {shotCode(index)} · {layer.name}
        </span>
        <button
          type="button"
          className="dir-direction-close"
          aria-label="Close directions"
          data-dismiss
        >
          <Icon name="close" size={12} />
        </button>
      </header>
      {locked && <p className="dir-hint">Unlock this clip or view to edit.</p>}
      {movement ? (
        <div
          className="dir-direction-choices"
          role="group"
          aria-label={TITLES[pick.view]}
        >
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              data-choice
              disabled={locked}
              aria-pressed={c.on}
              title={c.title}
              onClick={() => set(c.patch, true)}
            >
              <MovementGlyph variant={c.glyph} color="currentColor" />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <p className="dir-direction-eyebrow">Shot type</p>
          <div
            className="dir-direction-choices chips"
            role="group"
            aria-label="Shot type"
          >
            {SHOT_TYPES.map((s) => (
              <button
                key={s.id}
                type="button"
                data-choice
                disabled={locked}
                aria-pressed={d.shot === s.id}
                onClick={() => set({ shot: d.shot === s.id ? null : s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="dir-direction-eyebrow">Lens feel</p>
          <div
            className="dir-direction-choices chips"
            role="group"
            aria-label="Lens feel"
          >
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                data-choice
                disabled={locked}
                aria-pressed={d.lens === l.id}
                onClick={() => set({ lens: d.lens === l.id ? null : l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        {movement
          ? "Follows this shot · choose again to clear · Esc closes"
          : "Creative direction, not a lens setting · Esc closes"}
      </footer>
    </AnchoredPopover>
  );
}
