// The three prompt commands: `set-global-prompt` (the project's one primary
// direction), `set-clip-prompt` (one clip's own words) and
// `set-clip-directions` (one clip's typed shot, lens, camera and action).
// Free text and typed directions are separate fields, so neither command
// touches the other's. None of them submits, quotes or plans a generation.
import {
  CLIP_PROMPT_LIMIT,
  GLOBAL_PROMPT_LIMIT,
  patchDirections,
  readDirections,
  readPrompt,
  type DirectionsPatch,
} from "./directions";
import { unlocked } from "./layer-commands";
import type { Layer, Project } from "./types";

export type PromptCommand =
  | { op: "set-global-prompt"; text: string }
  | { op: "set-clip-prompt"; layerId: string; text: string }
  | { op: "set-clip-directions"; layerId: string; directions: DirectionsPatch };
export type PromptOp = PromptCommand["op"];

/** Required, then optional fields beyond `op`, as `commands.ts` reads them. */
export const PROMPT_FIELDS: Record<PromptOp, [string[], string[]]> = {
  "set-global-prompt": [["text"], []],
  "set-clip-prompt": [["layerId", "text"], []],
  "set-clip-directions": [["layerId", "directions"], []],
};
export const isPromptOp = (op: string): op is PromptOp =>
  Object.hasOwn(PROMPT_FIELDS, op);

/** The fields `parseCommand` does not read itself: text and directions. */
export function readPromptFields(op: PromptOp, value: Record<string, unknown>) {
  if (op === "set-clip-directions")
    return { directions: readDirections(value.directions) };
  return {
    text: readPrompt(
      value.text,
      op === "set-global-prompt" ? GLOBAL_PROMPT_LIMIT : CLIP_PROMPT_LIMIT,
    ),
  };
}

/** Text with nothing but spaces in it reads as no prompt. */
const blank = (text: string) => !text.trim();

export function applyPromptCommand(p: Project, c: PromptCommand): Project {
  if (c.op === "set-global-prompt") {
    const { globalPrompt: _previous, ...rest } = p;
    return blank(c.text) ? rest : { ...rest, globalPrompt: c.text };
  }
  const layer = unlocked(p, c.layerId);
  const { prompt, directions, ...rest } = layer;
  const next: Partial<Layer> = rest;
  if (c.op === "set-clip-prompt") {
    if (!blank(c.text)) next.prompt = c.text;
    if (directions) next.directions = directions;
  } else {
    if (prompt !== undefined) next.prompt = prompt;
    const merged = patchDirections(directions, c.directions);
    if (merged) next.directions = merged;
  }
  return replaceLayer(p, next as Layer);
}

/** The layer in place, so a cleared field is gone rather than undefined. */
const replaceLayer = (p: Project, layer: Layer): Project => ({
  ...p,
  layers: p.layers.map((l) => (l.id === layer.id ? layer : l)),
});
