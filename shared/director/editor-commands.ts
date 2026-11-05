// The Editor's composition timing, names and stacking order as shared
// commands: the transport's rate and length, the inspector's name field and
// its Move up / Move down buttons. The studio, an agent and the feedback
// replay make these edits through one rule, so they cannot disagree.
import { patch, refuse, unlocked } from "./layer-commands";
import { retimeProject } from "./retime";
import { lanes, reorderLane } from "./tracks";
import { LAYER_LIMIT, type Project } from "./types";

/** The renderer's length ceiling, which bundle validation also holds. */
export const COMPOSITION_MAX_SECONDS = 120;
/** The rates the bundle schema accepts; the Editor offers a few of them. */
export const FPS_LIMITS = { min: 1, max: 120 } as const;

export type EditorCommand =
  | { op: "set-fps"; fps: number }
  | { op: "set-duration"; durationFrames: number }
  | { op: "rename-project"; name: string }
  | { op: "rename-layer"; layerId: string; name: string }
  | { op: "reorder-layer"; layerId: string; by: number };
export type EditorOp = EditorCommand["op"];

export const EDITOR_FIELDS: Record<EditorOp, [string[], string[]]> = {
  "set-fps": [["fps"], []],
  "set-duration": [["durationFrames"], []],
  "rename-project": [["name"], []],
  "rename-layer": [["layerId", "name"], []],
  "reorder-layer": [["layerId", "by"], []],
};
export const isEditorOp = (op: string): op is EditorOp =>
  Object.hasOwn(EDITOR_FIELDS, op);

/**
 * Fields the common parser does not read. Ids, frames and names (control
 * characters replaced, trimmed, 1 to 120 characters) have passed it already.
 */
export function readEditorFields(value: Record<string, unknown>) {
  if (value.op === "set-fps") {
    const { fps } = value;
    if (
      !Number.isInteger(fps) ||
      (fps as number) < FPS_LIMITS.min ||
      (fps as number) > FPS_LIMITS.max
    )
      refuse(
        `fps must be a whole number from ${FPS_LIMITS.min} to ${FPS_LIMITS.max}`,
      );
    return { fps: fps as number };
  }
  if (value.op === "reorder-layer") {
    const { by } = value;
    if (
      !Number.isInteger(by) ||
      by === 0 ||
      Math.abs(by as number) >= LAYER_LIMIT
    )
      refuse(
        `by must be a whole number of tracks, not 0, below ${LAYER_LIMIT} either way`,
      );
    return { by: by as number };
  }
  return {};
}

export function applyEditorCommand(project: Project, c: EditorCommand) {
  switch (c.op) {
    case "set-fps":
      // The transport's rate change: every clip keeps its moment in seconds,
      // locked ones included, since the whole time base changes.
      return retimeProject(project, c.fps);
    case "set-duration":
      return setDuration(project, c.durationFrames);
    case "rename-project":
      return { ...project, name: c.name };
    case "rename-layer":
      // The inspector's name field is disabled on a locked clip.
      unlocked(project, c.layerId);
      return patch(project, c.layerId, { name: c.name });
    case "reorder-layer":
      return reorder(project, c.layerId, c.by);
  }
}

/**
 * The composition's length, as the transport's Length control sets it: it
 * may run past the last clip, never end before one does or before a note.
 */
function setDuration(project: Project, durationFrames: number): Project {
  const { fps } = project.composition;
  const most = Math.floor(COMPOSITION_MAX_SECONDS * fps);
  if (durationFrames > most)
    refuse(
      `A composition runs at most ${COMPOSITION_MAX_SECONDS} seconds: ${most} frames at ${fps} fps`,
    );
  const late = project.layers.find(
    (l) => l.startFrame + l.durationFrames > durationFrames,
  );
  if (late)
    refuse(
      `${late.name} ends at frame ${late.startFrame + late.durationFrames}; move or trim it before shortening the composition`,
    );
  const note = project.notes?.find((n) => n.frame >= durationFrames);
  if (note)
    refuse(
      `Note ${note.id} is at frame ${note.frame}; move or delete it before shortening the composition`,
    );
  return {
    ...project,
    composition: { ...project.composition, durationFrames },
  };
}

/**
 * The inspector's Move up (`by` 1) and Move down (-1), `by` tracks at once:
 * the clip's whole track moves in stacking order, past its neighbours.
 */
function reorder(project: Project, layerId: string, by: number): Project {
  const layer = unlocked(project, layerId);
  const all = lanes(project.layers);
  const at = all.findIndex((lane) => lane.layers.includes(layer));
  const to = at + by;
  if (to < 0 || to >= all.length)
    refuse(
      by > 0
        ? `${layer.name}'s track can move up at most ${all.length - 1 - at}`
        : `${layer.name}'s track can move down at most ${at}`,
    );
  let layers = project.layers;
  for (let i = 0; i < Math.abs(by); i++)
    layers = reorderLane(layers, layerId, by > 0 ? 1 : -1);
  return { ...project, layers };
}
