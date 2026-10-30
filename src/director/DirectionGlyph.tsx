import type { Layer } from "../../shared/director/types";
import { cameraSections } from "../../shared/camera";
import { MovementGlyph } from "../components/MovementGlyph";
import { SUBJECT_ACTIONS } from "../../shared/director/directions";

/** Genobi's camera movement terms drawn with the supplied movement glyphs. */
export const MOVEMENT_GLYPHS: Record<string, string> = {
  orbit: "orbit",
  arc: "arc",
  "dolly-in": "push_in",
  pan: "pan_r",
  "pan-left": "pan_l",
  "pan-right": "pan_r",
  tilt: "tilt_u",
  crane: "crane_up",
  trucking: "truck_r",
  "lazy-susan": "orbit_ccw",
  "pull-back": "pull_out",
  "dolly-left": "truck_l",
  "dolly-right": "truck_r",
  "jib-down": "crane_dn",
  follow: "forward",
  handheld: "handheld",
  static: "static",
};

const movements = cameraSections.find((s) => s.id === "movements")!;
/** Camera movement terms in the picker's order. */
export const MOVEMENT_TERMS = movements.terms;

/** The camera movement or subject action a shot carries, in words. */
export function directionLabel(view: "camera" | "action", l: Layer) {
  const d = l.directions;
  if (view === "camera") {
    const id = d?.camera?.movements;
    return id ? movements.terms.find((t) => t.id === id)?.label : undefined;
  }
  return SUBJECT_ACTIONS.find((a) => a.id === d?.action)?.label;
}

/** A view cell's glyph: the chosen direction, or a quiet "+" when unset. */
export default function DirectionGlyph({
  view,
  layer,
}: {
  view: "camera" | "action" | "markers" | "rhythm";
  layer: Layer;
}) {
  const d = layer.directions;
  const variant =
    view === "camera"
      ? d?.camera?.movements && MOVEMENT_GLYPHS[d.camera.movements]
      : view === "action"
        ? d?.action
        : undefined;
  if (!variant)
    return (
      <span className="dir-cell-unset" aria-hidden="true">
        +
      </span>
    );
  return <MovementGlyph variant={variant} color="var(--lane-color)" />;
}
