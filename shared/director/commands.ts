// Director commands: the small, exact edits an agent, a voice prompt or a 3D
// gesture can make to a project. One parser and one pure `applyCommand` serve
// the local server (against its project copy) and the studio (against its own
// store, from the copy's event stream), so the two cannot disagree.
import { readResolution, setResolution, type Resolution } from "./resolution";
import type { CameraSelection } from "../camera";
import { cleanPrompt, readCamera } from "./directions";
import {
  parseProjectPreferences,
  type ProjectPreferences,
} from "../licensing/project-preferences";
import { placeAsset } from "./assets";
import { graphicParameters, recipeFor } from "./graphic-commands";
import {
  BEAT_GRID_FIELDS,
  readBeatGrid,
  setBeatGrid,
  type BeatGridPatch,
} from "./beat-grid-command";
import {
  clean,
  isObject,
  patch,
  PLACEMENT_FIELDS,
  readParameters,
  readPlacement,
  refuse,
  setParameters,
  setPlacement,
  unlocked,
  type Placement,
} from "./layer-commands";
import {
  applyNoteCommand,
  isNoteOp,
  NOTE_FIELDS,
  readNoteFields,
  type NoteCommand,
} from "./notes";
import {
  applyPromptCommand,
  isPromptOp,
  PROMPT_FIELDS,
  readPromptFields,
  type PromptCommand,
} from "./prompt-commands";
import { setShotCamera, setTemplateInputs } from "./template-commands";
import { laneId, lanes, moveToLane, trackFamily } from "./tracks";
import {
  checkReferences,
  LAYER_LIMIT,
  type Layer,
  type Parameters,
  type Project,
} from "./types";

export { CommandError } from "./layer-commands";
export { LAYER_LIMIT };

/** Layer, asset, module and shot ids, as the bundle schema writes them. */
export const DIRECTOR_ID = /^[a-z][a-z0-9-]{0,63}$/;
/**
 * A project copy's handle on the local server: the project id, a dot and ten
 * random characters. Two owners may hold one project id; handles stay apart.
 */
export const COPY_ID = /^[a-z][a-z0-9-]{0,63}\.[a-z2-9]{10}$/;
/** The project prompt's limit, the same as the prompt brief's. */
export const PROMPT_LIMIT = 12000;
export const NAME_LIMIT = 120;
const FRAME_LIMIT = 1_000_000;

/** A track id, or `new` for a fresh lane at the top of its family. */
type Track = string;
export type TemplateInputPatch = {
  subject?: string;
  title?: string;
  acoustic?: unknown;
};
export type DirectorCommand =
  | {
      op: "add-clip";
      layerId: string;
      assetId: string;
      track: Track;
      startFrame: number;
      durationFrames: number;
      name?: string;
      /** The in-point: the first source frame shown (audio and video). */
      sourceStartFrame?: number;
    }
  | {
      op: "add-graphic";
      layerId: string;
      moduleId: string;
      track: Track;
      startFrame: number;
      durationFrames: number;
      name?: string;
      /** Over a layer using the recipe; all it requires if none does. */
      parameters?: Parameters;
    }
  | { op: "move-clip"; layerId: string; startFrame: number; track?: Track }
  | {
      op: "trim-clip";
      layerId: string;
      startFrame: number;
      durationFrames: number;
    }
  | { op: "set-prompt"; text: string }
  | { op: "set-preferences"; preferences: ProjectPreferences | null }
  | { op: "set-camera"; shotId: string; camera: CameraSelection }
  | { op: "set-template-inputs"; inputs: TemplateInputPatch }
  | { op: "replace-plate"; layerId: string; assetId: string }
  | ({ op: "set-placement"; layerId: string } & Placement)
  | { op: "set-parameters"; layerId: string; parameters: Parameters }
  | ({ op: "set-beat-grid" } & BeatGridPatch)
  | ({ op: "set-resolution" } & Resolution)
  | PromptCommand
  | NoteCommand;
export type DirectorOp = DirectorCommand["op"];

/** Required, then optional fields beyond `op`, per command. */
const FIELDS: Record<DirectorOp, [string[], string[]]> = {
  "add-clip": [
    ["layerId", "assetId", "track", "startFrame", "durationFrames"],
    ["name", "sourceStartFrame"],
  ],
  "add-graphic": [
    ["layerId", "moduleId", "track", "startFrame", "durationFrames"],
    ["name", "parameters"],
  ],
  "move-clip": [["layerId", "startFrame"], ["track"]],
  "trim-clip": [["layerId", "startFrame", "durationFrames"], []],
  "set-prompt": [["text"], []],
  "set-preferences": [["preferences"], []],
  "set-camera": [["shotId", "camera"], []],
  "set-template-inputs": [["inputs"], []],
  "replace-plate": [["layerId", "assetId"], []],
  "set-placement": [["layerId"], [...PLACEMENT_FIELDS]],
  "set-parameters": [["layerId", "parameters"], []],
  "set-beat-grid": [[], [...BEAT_GRID_FIELDS]],
  "set-resolution": [["width", "height"], []],
  ...PROMPT_FIELDS,
  ...NOTE_FIELDS,
};
export const DIRECTOR_OPS = Object.keys(FIELDS) as DirectorOp[];

/**
 * A command from untrusted data: an unknown op, a missing or unexpected
 * field, a wrong type, an id outside the bundle's pattern or a value over its
 * limit is refused. Ids that must exist in the project are checked when the
 * command is applied.
 */
export function parseCommand(value: unknown): DirectorCommand {
  if (!isObject(value)) return refuse("A command must be an object");
  const op = value.op;
  if (typeof op !== "string" || !Object.hasOwn(FIELDS, op))
    return refuse(`Unknown command; use one of ${DIRECTOR_OPS.join(", ")}`);
  const [required, optional] = FIELDS[op as DirectorOp];
  const extra = Object.keys(value).find(
    (k) => k !== "op" && !required.includes(k) && !optional.includes(k),
  );
  if (extra) refuse(`${op} does not take ${extra.slice(0, 40)}`);
  const missing = required.find((k) => value[k] === undefined);
  if (missing) refuse(`${op} needs ${missing}`);
  const c: Record<string, unknown> = { op };
  for (const key of ["layerId", "assetId", "moduleId", "shotId", "noteId"])
    if (key in value) {
      if (typeof value[key] !== "string" || !DIRECTOR_ID.test(value[key]))
        refuse(`${key} must be a lowercase id such as layer-1`);
      c[key] = value[key];
    }
  if ("track" in value && value.track !== undefined) {
    if (
      typeof value.track !== "string" ||
      (value.track !== "new" && !DIRECTOR_ID.test(value.track))
    )
      refuse("track must be a track id or new");
    c.track = value.track;
  }
  for (const key of [
    "startFrame",
    "durationFrames",
    "sourceStartFrame",
    "frame",
  ])
    if (key in value && value[key] !== undefined) {
      const n = value[key];
      const min = key === "durationFrames" ? 1 : 0;
      if (
        !Number.isSafeInteger(n) ||
        (n as number) < min ||
        (n as number) > FRAME_LIMIT
      )
        refuse(`${key} must be a whole number of frames from ${min}`);
      c[key] = n;
    }
  if ("name" in value && value.name !== undefined) {
    const name = typeof value.name === "string" ? clean(value.name) : "";
    if (!name || name.length > NAME_LIMIT)
      refuse(`name must be 1 to ${NAME_LIMIT} characters`);
    c.name = name;
  }
  if (op === "set-prompt") {
    if (typeof value.text !== "string" || value.text.length > PROMPT_LIMIT)
      refuse(`text must be at most ${PROMPT_LIMIT} characters`);
    c.text = cleanPrompt(value.text as string);
  }
  if (op === "set-camera") c.camera = readCamera(value.camera);
  if (op === "set-preferences")
    c.preferences =
      value.preferences === null
        ? null
        : parseProjectPreferences(value.preferences);
  if (op === "set-placement") Object.assign(c, readPlacement(value));
  if (op === "set-beat-grid") Object.assign(c, readBeatGrid(value));
  if (op === "set-resolution") Object.assign(c, readResolution(value));
  if (op === "set-parameters" || value.parameters !== undefined)
    c.parameters = readParameters(value.parameters);
  if (isNoteOp(op)) Object.assign(c, readNoteFields(value));
  if (isPromptOp(op)) Object.assign(c, readPromptFields(op, value));
  if (op === "set-template-inputs") {
    const inputs = value.inputs;
    if (!isObject(inputs)) return refuse("inputs must be an object");
    const keys = Object.keys(inputs);
    const other = keys.find(
      (k) => !["subject", "title", "acoustic"].includes(k),
    );
    if (other)
      refuse(
        other === "aspect" || other === "bpm"
          ? `${other} rebuilds the project; change it in the studio`
          : `Unknown template input: ${other.slice(0, 40)}`,
      );
    if (!keys.length) refuse("inputs needs subject, title or acoustic");
    for (const k of ["subject", "title"])
      if (k in inputs && typeof inputs[k] !== "string")
        refuse(`${k} must be text`);
    c.inputs = { ...inputs };
  }
  return c as DirectorCommand;
}

/** The part of a project commands edit: the manifest and the project prompt. */
export interface DirectorCopy {
  project: Project;
  prompt: string;
}
export type CommandResult =
  { ok: true; copy: DirectorCopy } | { ok: false; error: string };

/**
 * The next copy, one revision on, or a refusal saying why. Pure: the same
 * copy and command give the same result in the server and the studio. The
 * caller still runs its full bundle validation before storing the result.
 */
export function applyCommand(
  copy: DirectorCopy,
  value: unknown,
): CommandResult {
  try {
    const command = parseCommand(value);
    const next = apply(copy, command);
    next.project.revision = copy.project.revision + 1;
    checkReferences(next.project);
    return { ok: true, copy: next };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function apply(copy: DirectorCopy, c: DirectorCommand): DirectorCopy {
  const project = copy.project;
  const same = (p: Project): DirectorCopy => ({
    project: p,
    prompt: copy.prompt,
  });
  switch (c.op) {
    case "set-preferences": {
      const { preferences: _previous, ...rest } = project;
      return same(
        c.preferences === null ? rest : { ...rest, preferences: c.preferences },
      );
    }
    case "set-prompt":
      return { project: { ...project }, prompt: c.text };
    case "add-clip":
    case "add-graphic":
      return same(addLayer(project, c));
    case "move-clip": {
      const layer = unlocked(project, c.layerId);
      fits(project, c.startFrame, layer.durationFrames);
      if (c.track !== undefined && c.track !== laneId(layer)) {
        if (c.track !== "new") lane(project, c.track, layer.kind);
        return same(moveToLane(project, layer.id, c.startFrame, c.track));
      }
      return same(patch(project, layer.id, { startFrame: c.startFrame }));
    }
    case "trim-clip": {
      const layer = unlocked(project, c.layerId);
      fits(project, c.startFrame, c.durationFrames);
      const shift = c.startFrame - layer.startFrame;
      const changes: Partial<Layer> = {
        startFrame: c.startFrame,
        durationFrames: c.durationFrames,
      };
      // A left trim moves the source in step, as the timeline's trim does.
      if ("sourceStartFrame" in layer) {
        const source = layer.sourceStartFrame + shift;
        if (source < 0) refuse(`${layer.name} has no earlier source to show`);
        Object.assign(changes, { sourceStartFrame: source });
      } else if ("moduleId" in layer) {
        const offset = (layer.animationOffsetFrames ?? 0) + shift;
        if (offset < 0) refuse(`${layer.name} cannot start before its recipe`);
        Object.assign(changes, { animationOffsetFrames: offset });
      }
      return same(patch(project, layer.id, changes));
    }
    case "replace-plate": {
      const layer = unlocked(project, c.layerId);
      const asset = project.assets[c.assetId];
      if (!asset) refuse(`No asset ${c.assetId} in this project`);
      if (layer.kind !== "image" && layer.kind !== "video")
        refuse(`${layer.name} is not a picture layer`);
      if (asset.kind === "audio") refuse("A plate takes an image or a video");
      // A reference still gets a production alias with a fixed id.
      const alias = `${c.assetId.slice(0, 55)}-plate`;
      const existing = project.assets[alias];
      if (
        asset.use === "reference" &&
        existing &&
        existing.file.sha256 !== asset.file.sha256
      )
        refuse(`Asset id ${alias} is taken`);
      return same(placeAsset(project, c.assetId, [layer.id], alias));
    }
    case "set-camera":
      return same(setShotCamera(project, c.shotId, c.camera));
    case "set-template-inputs":
      return same(setTemplateInputs(project, c.inputs));
    case "set-placement": {
      const { op: _op, layerId, ...placement } = c;
      return same(setPlacement(project, layerId, placement));
    }
    case "set-parameters":
      return same(setParameters(project, c.layerId, c.parameters));
    case "set-resolution":
      return same(setResolution(project, c));
    case "set-beat-grid": {
      const { op: _op, ...grid } = c;
      return same(setBeatGrid(project, grid));
    }
    case "add-note":
    case "resolve-note":
    case "delete-note":
      return same(applyNoteCommand(project, c));
    case "set-global-prompt":
    case "set-clip-prompt":
    case "set-clip-directions":
      return same(applyPromptCommand(project, c));
  }
}

function fits(project: Project, start: number, duration: number) {
  if (start + duration > project.composition.durationFrames)
    refuse(
      `The clip would end after the project's ${project.composition.durationFrames} frames`,
    );
}
/** An existing lane that takes this kind of clip. */
function lane(project: Project, id: string, kind: Layer["kind"]) {
  const found = lanes(project.layers).find((l) => l.id === id);
  if (!found) return refuse(`No track ${id} in this project`);
  if (found.family !== trackFamily(kind))
    refuse(`Track ${id} holds ${found.family} clips, not ${kind}`);
  return found;
}

const still = {
  opacity: 1,
  position: { x: 0, y: 0 },
  scale: 1,
  rotationDegrees: 0,
};

function addLayer(
  from: Project,
  c: Extract<DirectorCommand, { op: "add-clip" | "add-graphic" }>,
): Project {
  let project = from;
  if (project.layers.length >= LAYER_LIMIT)
    refuse(`A project holds at most ${LAYER_LIMIT} layers`);
  const taken = project.layers.some(
    (l) => l.id === c.layerId || laneId(l) === c.layerId,
  );
  if (taken) refuse(`Layer id ${c.layerId} is taken`);
  fits(project, c.startFrame, c.durationFrames);
  const base = {
    id: c.layerId,
    name: c.name ?? c.layerId,
    startFrame: c.startFrame,
    durationFrames: c.durationFrames,
    locked: false,
  };
  let layer: Layer;
  if (c.op === "add-clip") {
    const asset = project.assets[c.assetId];
    if (!asset) return refuse(`No asset ${c.assetId} in this project`);
    if (asset.use !== "production")
      refuse(`${c.assetId} is a reference; place a production asset`);
    if (asset.kind === "image" && c.sourceStartFrame !== undefined)
      refuse(`${c.assetId} is a still image; it has no in-point`);
    const sourceStartFrame = c.sourceStartFrame ?? 0;
    layer =
      asset.kind === "audio"
        ? {
            ...base,
            kind: "audio",
            assetId: c.assetId,
            sourceStartFrame,
            gain: 1,
          }
        : asset.kind === "video"
          ? {
              ...base,
              kind: "video",
              assetId: c.assetId,
              sourceStartFrame,
              fit: "contain",
              ...still,
            }
          : {
              ...base,
              kind: "image",
              assetId: c.assetId,
              fit: "contain",
              ...still,
            };
  } else {
    // A recipe no layer uses yet, even one from the registry, takes the
    // parameters given; otherwise they go over a using layer's settings.
    const recipe = recipeFor(project, c.moduleId);
    project = recipe.project;
    const { module } = recipe;
    const model = project.layers.find(
      (l) => "moduleId" in l && l.moduleId === c.moduleId,
    );
    const parameters = graphicParameters(
      c.moduleId,
      module,
      model && "parameters" in model ? model.parameters : undefined,
      c.parameters,
    );
    layer =
      module.mode === "filter"
        ? {
            ...base,
            kind: "filter",
            moduleId: c.moduleId,
            parameters,
            input: "composite-below",
          }
        : {
            ...base,
            kind: "graphics",
            moduleId: c.moduleId,
            parameters,
            ...still,
          };
  }
  const layers = [...project.layers];
  let at: number;
  if (c.track === "new") {
    // Media sits under the graphics, graphics under the filters.
    const above =
      layer.kind === "filter"
        ? -1
        : layers.findIndex((l) =>
            layer.kind === "graphics"
              ? l.kind === "filter"
              : l.kind === "graphics" || l.kind === "filter",
          );
    at = above < 0 ? layers.length : above;
  } else {
    lane(project, c.track, layer.kind);
    layer = { ...layer, track: c.track };
    at = layers.reduce((end, l, i) => (laneId(l) === c.track ? i + 1 : end), 0);
  }
  layers.splice(at, 0, layer);
  return { ...project, layers };
}
