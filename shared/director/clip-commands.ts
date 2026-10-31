// Basic timeline edits shared by the agent API and the Editor. They change
// the manifest only: source media, provenance and review notes are retained.
import { duplicateLayer } from "./duplicate";
import { layerOf, patch, refuse, unlocked } from "./layer-commands";
import { keepNotes } from "./notes";
import { splitLayer } from "./split";
import { laneId } from "./tracks";
import type { Project } from "./types";

export type ClipCommand =
  | { op: "remove-clip"; layerId: string }
  | { op: "duplicate-clip"; layerId: string; newLayerId: string }
  | {
      op: "split-clip";
      layerId: string;
      frame: number;
      newLayerId: string;
    }
  | { op: "set-muted"; layerId: string; muted: boolean }
  | { op: "set-gain"; layerId: string; gain: number };
export type ClipOp = ClipCommand["op"];

export const CLIP_FIELDS: Record<ClipOp, [string[], string[]]> = {
  "remove-clip": [["layerId"], []],
  "duplicate-clip": [["layerId", "newLayerId"], []],
  "split-clip": [["layerId", "frame", "newLayerId"], []],
  "set-muted": [["layerId", "muted"], []],
  "set-gain": [["layerId", "gain"], []],
};
export const isClipOp = (op: string): op is ClipOp =>
  Object.hasOwn(CLIP_FIELDS, op);

/** Ids and frames have already passed the common command parser. */
export function readClipFields(value: Record<string, unknown>) {
  if (value.op === "set-muted") {
    if (typeof value.muted !== "boolean") refuse("muted must be true or false");
    return { muted: value.muted };
  }
  if (value.op === "set-gain") {
    if (
      typeof value.gain !== "number" ||
      !Number.isFinite(value.gain) ||
      value.gain < 0 ||
      value.gain > 2
    )
      refuse("gain must be a number from 0 to 2");
    return { gain: value.gain };
  }
  return {};
}

export function applyClipCommand(project: Project, c: ClipCommand): Project {
  switch (c.op) {
    case "remove-clip":
      unlocked(project, c.layerId);
      return keepNotes({
        ...project,
        layers: project.layers.filter((l) => l.id !== c.layerId),
      });
    case "duplicate-clip":
      // The inspector permits copying a locked layer. Its original stays
      // protected; the copy has a fresh id and an independent unlocked lane.
      return duplicateLayer(project, c.layerId, c.newLayerId);
    case "split-clip":
      if (
        project.layers.some(
          (l) => l.id === c.newLayerId || laneId(l) === c.newLayerId,
        )
      )
        refuse(`Layer id ${c.newLayerId} is taken`);
      return splitLayer(project, c.layerId, c.frame, c.newLayerId);
    case "set-muted":
      // Like the timeline's visibility control, mute is allowed on a
      // locked clip; it does not unlock or change timing/placement.
      layerOf(project, c.layerId);
      return patch(project, c.layerId, { muted: c.muted });
    case "set-gain": {
      const layer = unlocked(project, c.layerId);
      if (layer.kind !== "audio")
        refuse(`${layer.name} is ${layer.kind}; only audio clips have gain`);
      return patch(project, c.layerId, { gain: c.gain });
    }
  }
}
