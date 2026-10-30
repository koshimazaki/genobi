/**
 * Ten camera plates: presets and combos of Holodeck's camera moves
 * (`src/world-builder/camera-moves.ts`, ported from Holodeck's
 * `components/ui/camera-moves.ts`). A preset plays one move at full
 * strength, as Holodeck does with combos off; a combo stacks moves as
 * additive layers, as Holodeck does with combos on. Adding a plate is
 * adding an entry here.
 */
import {
  CAMERA_MOVE_BY_KEY,
  type CameraMoveKey,
} from "../world-builder/camera-moves";

export interface PlateLayer {
  move: CameraMoveKey;
  /** Start and length as fractions of the plate's duration. */
  at: number;
  span: number;
}

export interface CameraPlate {
  id: string;
  label: string;
  summary: string;
  kind: "preset" | "combo";
  /** A follow move whose offset is the opening framing. */
  from: CameraMoveKey;
  layers: readonly PlateLayer[];
}

/** Holodeck's `CAMERA_PROGRESS_MAX_LAYERS`. */
export const MAX_PLATE_LAYERS = 4;

const whole = (move: CameraMoveKey): PlateLayer[] => [{ move, at: 0, span: 1 }];

export const PLATES: readonly CameraPlate[] = [
  {
    id: "push-in",
    label: "Push in",
    summary: "From a wide front view in to a close framing.",
    kind: "preset",
    from: "pullOut",
    layers: whole("pushIn"),
  },
  {
    id: "pull-out",
    label: "Pull out",
    summary: "From the face out to a wide view.",
    kind: "preset",
    from: "face",
    layers: whole("pullOut"),
  },
  {
    id: "quarter-orbit",
    label: "Quarter orbit",
    summary: "A 90° orbit that widens a little as it turns.",
    kind: "preset",
    from: "face",
    layers: whole("orbit90"),
  },
  {
    id: "half-orbit",
    label: "Half orbit",
    summary: "A 180° orbit round to the back.",
    kind: "preset",
    from: "face",
    layers: whole("orbit180"),
  },
  {
    id: "wide-orbit",
    label: "Wide orbit",
    summary: "A wide, high half orbit the other way.",
    kind: "preset",
    from: "pullOut",
    layers: whole("wideOrbit"),
  },
  {
    id: "crane-up",
    label: "Crane up",
    summary: "From low behind the subject up to a high crane view.",
    kind: "preset",
    from: "lowTrack",
    layers: whole("crane"),
  },
  {
    id: "over-shoulder",
    label: "Over the shoulder",
    summary: "From the side round to an over-the-shoulder view.",
    kind: "preset",
    from: "sideAction",
    layers: whole("shoulder"),
  },
  {
    id: "push-orbit",
    label: "Push and orbit",
    summary: "A 60° orbit with a push in layered over it.",
    kind: "combo",
    from: "face",
    layers: [
      { move: "orbit60", at: 0, span: 1 },
      { move: "pushIn", at: 0.25, span: 0.75 },
    ],
  },
  {
    id: "spiral-rise",
    label: "Spiral rise",
    summary: "A 120° orbit with a crane rising through it.",
    kind: "combo",
    from: "face",
    layers: [
      { move: "orbit120", at: 0, span: 1 },
      { move: "crane", at: 0.35, span: 0.65 },
    ],
  },
  {
    id: "orbit-reveal",
    label: "Orbit reveal",
    summary: "Pull out from close, then orbit to reveal the set.",
    kind: "combo",
    from: "pushIn",
    layers: [
      { move: "pullOut", at: 0, span: 0.7 },
      { move: "orbit90", at: 0.3, span: 0.7 },
    ],
  },
];

export const PLATE_BY_ID: Record<string, CameraPlate> = Object.fromEntries(
  PLATES.map((p) => [p.id, p]),
);

/** Combo layers must be follow or orbit moves, as in Holodeck. */
export const isLayerMove = (key: CameraMoveKey) => {
  const move = CAMERA_MOVE_BY_KEY[key];
  return move.kind === "follow" || move.kind === "orbit";
};

/** Holodeck labels an orbit by its degrees alone; say what it is. */
export function moveLabel(key: CameraMoveKey): string {
  const move = CAMERA_MOVE_BY_KEY[key];
  return move.kind === "orbit"
    ? `Orbit ${Math.abs(move.degrees)}°`
    : move.label;
}
