import { checkNotes } from "./notes";
import { checkTracks } from "./tracks";
import { checkDirections, type LayerDirections } from "./directions";
import type { TemplateInputs } from "../templates/types";
import type { CameraSelection } from "../camera";
export type Parameters = Record<string, string | number | boolean>;
export interface Asset {
  kind: "audio" | "video" | "image";
  use: "production" | "reference";
  file: { path: string; sha256: string };
  durationSeconds?: number;
  origin: "fixture" | "uploaded" | "generated";
  generationId?: string;
}
export interface GraphicsModule {
  engine: "p5" | "animejs" | "threejs";
  engineVersion: string;
  mode: "overlay" | "filter";
  file: Asset["file"];
  parameterSchema: {
    properties?: Record<
      string,
      {
        type: string;
        minimum?: number;
        maximum?: number;
        enum?: string[];
        pattern?: string;
      }
    >;
    [key: string]: unknown;
  };
}
interface Base {
  id: string;
  name: string;
  kind: string;
  startFrame: number;
  durationFrames: number;
  locked: boolean;
  muted?: boolean;
  /** Retains the recipe clock after a split or left trim. */
  animationOffsetFrames?: number;
  /** Shared lane id; absent means the layer owns a lane named by its id. */
  track?: string;
  /** This clip's own prompt (`directions.ts`); absent means none. */
  prompt?: string;
  /** This clip's typed shot, lens, camera and action; kept apart from `prompt`. */
  directions?: LayerDirections;
}
export interface Visual {
  opacity: number;
  position: { x: number; y: number };
  scale: number;
  rotationDegrees: number;
  motion?: { scaleTo: number; xTo: number; yTo: number; opacityTo: number };
}
export type Layer = Base &
  (
    | { kind: "audio"; assetId: string; sourceStartFrame: number; gain: number }
    | ({
        kind: "video";
        assetId: string;
        sourceStartFrame: number;
        fit: "contain";
      } & Visual)
    | ({ kind: "image"; assetId: string; fit: "contain" } & Visual)
    | ({ kind: "graphics"; moduleId: string; parameters: Parameters } & Visual)
    | {
        kind: "filter";
        moduleId: string;
        parameters: Parameters;
        input: "composite-below";
      }
  );
/**
 * A comment pinned to a composition frame and, optionally, to one layer: the
 * person's review of an agent's edit, or an agent's reply. See `notes.ts`.
 */
export interface Note {
  id: string;
  frame: number;
  layerId?: string;
  text: string;
  author?: "person" | "agent";
  /** UTC, as `Date.prototype.toISOString` writes it. */
  createdAt?: string;
  resolved?: boolean;
}
export interface Project {
  /** Explicit project defaults, portable with the saved bundle. */
  preferences?: import("../licensing/project-preferences").ProjectPreferences;
  schemaVersion: "director.bundle.v1";
  id: string;
  name: string;
  revision: number;
  /** The one primary direction for the whole project; absent means none. */
  globalPrompt?: string;
  composition: {
    fps: number;
    durationFrames: number;
    width: number;
    height: number;
    /** Original pixel typography coordinates; absent uses the current frame. */
    designSize?: { width: number; height: number };
    colorSpace: "srgb";
    alpha: "straight";
    background: string;
    bpm?: number;
    /** Where a downbeat falls on the composition, in seconds (default 0). */
    beatOffsetSeconds?: number;
    /** Beats in a bar, for the timeline's bar lines (default 4). */
    beatsPerBar?: number;
  };
  assets: Record<string, Asset>;
  modules: Record<string, GraphicsModule>;
  layers: Layer[];
  generationPlans: {
    id: string;
    status: "not-run";
    replaceAssetId: string;
    referenceAssetIds: string[];
    prompt: string;
    /** A template shot's camera, once a command sets it (`set-camera`). */
    camera?: CameraSelection;
  }[];
  generations: {
    id: string;
    inputAssetIds: string[];
    referenceAssetIds: string[];
    outputAssetIds: string[];
    prompt: string;
    tool: string;
    /** Public recipe identity only; never provider/job IDs or credentials. */
    recipe?: Pick<
      import("../take").TakeRecipe,
      "id" | "version" | "route" | "location"
    >;
    /** A local media tool's result an agent handed in, not a model's output. */
    derivation?: Derivation;
  }[];
  /** The house-style template and inputs that built the project, if any. */
  template?: { id: string; inputs: TemplateInputs };
  /** Frame notes, in the order they were added. Absent in older bundles. */
  notes?: Note[];
  /**
   * The agent's revision the person's feedback is measured from: the project
   * as an agent's last command left it, or as an agent wrote it into a
   * bundle, with the prompt then. Its project holds no `feedbackBase` of its own. See `feedback.ts`.
   */
  feedbackBase?: FeedbackBase;
}
/**
 * How a handed-in file was made from other media by the local media tools
 * (`server/project-derived.ts`): the operation and its inputs in order, each
 * with its kind, where it came from and, when the project holds the same
 * bytes, that asset (also listed in the record's `inputAssetIds`). Studio
 * job and source ids are left out: lineage stays private.
 */
export interface Derivation {
  operation: "trim" | "concat" | "crossfade" | "space";
  sources: {
    kind: "video" | "audio";
    origin: "take" | "upload" | "library" | "derived";
    assetId?: string;
  }[];
}
export interface FeedbackBase {
  project: Project;
  prompt: string;
}
export const active = (layer: Layer, frame: number) =>
  !layer.muted &&
  frame >= layer.startFrame &&
  frame < layer.startFrame + layer.durationFrames;
export const localSeconds = (layer: Layer, frame: number, fps: number) =>
  (frame - layer.startFrame + (layer.animationOffsetFrames ?? 0)) / fps;
export function visualAt(layer: Layer & Visual, frame: number): Visual {
  const m = layer.motion;
  if (!m) return layer;
  const t = Math.max(
    0,
    Math.min(
      1,
      (frame - layer.startFrame) / Math.max(1, layer.durationFrames - 1),
    ),
  );
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    ...layer,
    scale: mix(layer.scale, m.scaleTo),
    opacity: mix(layer.opacity, m.opacityTo),
    position: {
      x: mix(layer.position.x, m.xTo),
      y: mix(layer.position.y, m.yTo),
    },
  };
}
/**
 * The largest media file the Director imports, and so the largest file a
 * project copy must accept: one constant, so an imported file is never
 * refused by the copy. 150 MiB leaves room for upscaled clips. This is the
 * local studio's limit; the hosted Worker stores no project media and must
 * set its own from Cloudflare's request and R2 limits (docs/cloudflare.md).
 */
export const DIRECTOR_MEDIA_BYTES = 150 * 1024 * 1024;
/** The most media one project (or bundle) holds, in the studio and its copy. */
export const DIRECTOR_PROJECT_BYTES = 150 * 1024 * 1024;
/** A byte limit in the binary megabytes the limits above are written in. */
export const formatMegabytes = (bytes: number) =>
  `${Math.round(bytes / (1024 * 1024))} MB`;
/** The limits as people read them, so no message can name a stale number. */
export const DIRECTOR_MEDIA_LIMIT = formatMegabytes(DIRECTOR_MEDIA_BYTES);
export const DIRECTOR_PROJECT_LIMIT = formatMegabytes(DIRECTOR_PROJECT_BYTES);
/**
 * The most layers a project holds: the preview limit the importer, the
 * project copy, splits and Director commands all read. Preparing the preview
 * and the per-frame render cost were measured flat up to 192 sequential
 * clips (docs/director-bundle/README.md), so 128 leaves headroom.
 */
export const LAYER_LIMIT = 128;
// Browser media durations are rounded to microseconds. Keep this tolerance
// much smaller than one frame while accepting an exact final frame.
export const MEDIA_DURATION_EPSILON_SECONDS = 1e-6;

export function checkReferences(p: Project) {
  checkTracks(p.layers);
  checkNotes(p);
  checkDirections(p);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const ids = new Set<string>();
  for (const l of p.layers) {
    if (ids.has(l.id)) fail(`Duplicate layer ${l.id}`);
    ids.add(l.id);
    if (l.startFrame + l.durationFrames > p.composition.durationFrames)
      fail(`Layer ${l.name} extends beyond composition`);
    if ("assetId" in l) {
      const a = p.assets[l.assetId];
      if (!a || a.kind !== l.kind || a.use !== "production")
        fail(`Invalid production asset for ${l.name}`);
      if (
        "sourceStartFrame" in l &&
        (l.sourceStartFrame + l.durationFrames) / p.composition.fps >
          (a.durationSeconds ?? 0) + MEDIA_DURATION_EPSILON_SECONDS
      )
        fail(`Source too short for ${l.name}`);
    } else {
      const m = p.modules[l.moduleId];
      if (!m || m.mode !== (l.kind === "filter" ? "filter" : "overlay"))
        fail(`Invalid graphics module for ${l.name}`);
    }
  }
  const generations = new Set<string>();
  for (const g of p.generations) {
    if (generations.has(g.id)) fail("Duplicate generation");
    generations.add(g.id);
    for (const id of [
      ...g.inputAssetIds,
      ...g.referenceAssetIds,
      ...g.outputAssetIds,
    ])
      if (!p.assets[id]) fail(`Unknown generation asset ${id}`);
    for (const source of g.derivation?.sources ?? [])
      if (source.assetId && !g.inputAssetIds.includes(source.assetId))
        fail(`Derivation source ${source.assetId} is not an input`);
    for (const id of g.outputAssetIds)
      if (
        p.assets[id].origin !== "generated" ||
        p.assets[id].generationId !== g.id
      )
        fail(`Invalid generation backlink ${id}`);
  }
  for (const [id, a] of Object.entries(p.assets)) {
    if (
      a.origin === "generated" &&
      !p.generations.some(
        (g) => g.id === a.generationId && g.outputAssetIds.includes(id),
      )
    )
      fail(`Missing provenance ${id}`);
    if (a.origin !== "generated" && a.generationId)
      fail(`Unexpected generation ${id}`);
  }
  const plans = new Set<string>();
  for (const g of p.generationPlans) {
    if (plans.has(g.id)) fail("Duplicate generation plan");
    plans.add(g.id);
    if (p.assets[g.replaceAssetId]?.use !== "production")
      fail("Invalid replacement asset");
    for (const id of g.referenceAssetIds)
      if (!p.assets[id]) fail("Missing moodboard asset");
  }
}
export function editLayer(
  p: Project,
  id: string,
  patch: Partial<Layer>,
  revision = p.revision,
): Project {
  if (revision !== p.revision)
    throw new Error("Project changed; reload before editing");
  const l = p.layers.find((l) => l.id === id);
  if (!l) throw new Error("Layer not found");
  if (
    l.locked &&
    !(
      Object.keys(patch).length === 1 &&
      (patch.locked === false || typeof patch.muted === "boolean")
    )
  )
    throw new Error("Unlock this layer first");
  const next = {
    ...p,
    revision: p.revision + 1,
    layers: p.layers.map((l) =>
      l.id === id ? ({ ...l, ...patch } as Layer) : l,
    ),
  };
  checkReferences(next);
  return next;
}
