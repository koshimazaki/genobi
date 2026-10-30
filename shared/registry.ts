import { deployEntries } from "./deploy-registry";
import {
  h3VideoControls,
  h3RouterControls,
  fluxVideoControls,
  fluxImageControls,
  kleinApiControls,
  kleinOpenControls,
  ltxAcousticControls,
  ltxVideoControls,
  ltxOpenControls,
  ltxProControls,
  swapControls,
  musicControls,
  upscaleControls,
} from "./controls";
import type { Entry, Family, ReadyEntry } from "./registry-types";
import type { Generator, VideoModel } from "./types";
export type {
  CameraModel,
  ComingEntry,
  Entry,
  Family,
  ReadyEntry,
  Route,
} from "./registry-types";

/**
 * The registry every later pass fills: one entry per thing the studio can run,
 * or will. The Model menu is drawn from it: a family switch picks LTX, FLUX,
 * H3 or Upscale, and the menu lists that family's entries in this order. `ready` entries are
 * selectable; `coming` entries are shown disabled with their `note` and can
 * never become a request. A ready entry also names the composer controls it
 * shows, so the row under the prompt changes with the model. Phase 4 adds
 * workflow templates and slots.
 */

export const registry: Entry[] = [
  {
    id: "ltx-2-5-fast",
    label: "LTX-2.5 Fast",
    task: "Text to video",
    family: "ltx",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "router",
    model: "ltx/ltx-2-5-fast",
    open: true,
    camera: "ltx-2.5",
    videoModel: "ltx-2.5",
    controls: ltxVideoControls,
  },
  ...deployEntries,
  {
    // MiniMax H3 through Comfy Router, from two reference images and no
    // guide video: the character sheet, then the storyboard. See
    // shared/comfy/h3-router.ts and docs/anime-teaser-template.md. It is the
    // H3 family's first row: it takes 4-15 s, six ratios and 2K, where the
    // OmniRef graphs below keep their one proven 5 s, 16:9 recipe. Version 2
    // writes the camera panel's H3 sentences into the prompt.
    id: "minimax-h3-router",
    label: "MiniMax H3",
    task: "Reference to video · 4–15 s",
    family: "h3",
    status: "ready",
    recipeVersion: 2,
    generator: "video",
    route: "router",
    model: "minimax/minimax-h3",
    open: true,
    camera: "minimax-h3",
    videoModel: "minimax-h3-router",
    controls: h3RouterControls,
  },
  ...(["rgb", "canny", "depth", "combined"] as const).map(
    (guide): ReadyEntry => ({
      id: guide === "rgb" ? "minimax-h3" : `minimax-h3-${guide}`,
      label: "MiniMax H3",
      task: `Omni ${guide === "rgb" ? "RGB" : guide === "canny" ? "Canny" : guide === "depth" ? "Depth" : "Combined"} · 5 s`,
      family: "h3",
      status: "ready",
      // Version 2: the camera panel's H3 sentences join the prompt.
      recipeVersion: 2,
      generator: "video",
      route: "workflow",
      model: `workflow/minimax-h3-${guide}`,
      open: true,
      camera: "minimax-h3",
      videoModel: guide === "rgb" ? "minimax-h3" : `minimax-h3-${guide}`,
      controls: h3VideoControls,
    }),
  ),
  {
    // Comfy's Openjutsu character swap (MiniMax H3, Akatz Labs' swap LoRA)
    // with a Klein box-edit first frame. Its custom node pack runs on its
    // Comfy deployment, local studio only (docs/openjutsu-swap.md).
    id: "openjutsu-swap",
    label: "Openjutsu",
    task: "Character swap",
    family: "h3",
    localOnly: true,
    // The composer sends no clip, character or part (`swap`); the script and
    // the agent's tool do.
    outsideComposer:
      "Runs from npm run swap, or genobi_quote then genobi_submit from an agent",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "workflow",
    model: "workflow/openjutsu-swap",
    open: true,
    camera: null,
    videoModel: "openjutsu-swap",
    controls: swapControls,
  },
  {
    id: "ltx-2-5-open",
    label: "LTX-2.5 · Open workflow",
    task: "Text to video",
    family: "ltx",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "workflow",
    model: "workflow/ltx-2-5-t2v",
    open: true,
    camera: "ltx-2.5",
    videoModel: "ltx-2.5-open",
    controls: ltxOpenControls,
  },
  {
    // LTX-2.5 Fast's graph plus the AKUSPACE LoRA, an open workflow on Comfy
    // Cloud; the prompt carries the treatment. See
    // workflows/ltx-2-5-akuspace-t2v.README.md.
    id: "ltx-2-5-akuspace",
    label: "LTX-2.5 · Acoustic Space",
    family: "ltx",
    status: "ready",
    recipeVersion: 2,
    generator: "video",
    route: "workflow",
    model: "workflow/ltx-2-5-akuspace-t2v",
    open: true,
    camera: "ltx-2.5",
    videoModel: "ltx-2.5-akuspace",
    controls: ltxAcousticControls,
  },
  {
    id: "ltx-2-5-pro",
    label: "LTX-2.5 Pro",
    task: "Text to video",
    family: "ltx",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "router",
    model: "ltx/ltx-2-5-pro",
    // Lightricks serves Pro through its API only; the open weights are Fast's.
    open: false,
    camera: "ltx-2.5",
    videoModel: "ltx-2.5-pro",
    controls: ltxProControls,
  },
  {
    id: "ltx-hdr",
    label: "LTX-2.5",
    task: "HDR",
    family: "ltx",
    status: "coming",
    open: true,
    note: "LTX HDR: needs the LTX pack on Comfy Cloud",
  },
  {
    id: "ltx-alpha",
    label: "LTX-2.5",
    task: "Alpha",
    family: "ltx",
    status: "coming",
    open: true,
    note: "LTX Alpha: needs the LTX pack on Comfy Cloud",
  },
  {
    id: "flux-3-video",
    label: "FLUX 3",
    task: "Text to video",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "router",
    model: "bfl/flux-3-video",
    open: false,
    camera: "flux-3",
    videoModel: "flux-3",
    controls: fluxVideoControls,
  },
  {
    // FLUX 3 from a start image. Genobi sends it to BFL directly, so it needs
    // a BFL key (`shared/provider.ts`); it has no Router route here.
    id: "flux-3-i2v",
    label: "FLUX 3",
    task: "Image to video",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "bfl",
    model: "flux-3-video",
    open: false,
    camera: "flux-3",
    videoModel: "flux-3-i2v",
    controls: fluxVideoControls,
  },
  {
    // The open upscaler: SeedVR2 3B (ByteDance Seed, Apache-2.0) as Comfy's
    // official core-node graph on the workflow route, a local ComfyUI or
    // Comfy Cloud; see workflows/seedvr2-upscale.README.md. Free on a local
    // ComfyUI; on Cloud it is estimated at FLUX Video Upscale's Precise rate.
    id: "seedvr2-upscale",
    label: "SeedVR2",
    task: "Video upscale",
    family: "upscale",
    status: "ready",
    recipeVersion: 1,
    generator: "upscale",
    route: "workflow",
    model: "workflow/seedvr2-upscale",
    open: true,
    camera: null,
    videoModel: "seedvr2-upscale",
    controls: upscaleControls,
  },
  {
    // BFL documents /v1/flux-tools/video-upscale-v1 as FLUX Video Upscale;
    // Router lists the same upscaler as bfl/video-upscale-v1 (checked
    // 23 October 2026). A Router entry like FLUX 3: BFL direct on a BFL key.
    id: "flux-video-upscale",
    label: "FLUX Video Upscale",
    family: "upscale",
    status: "ready",
    recipeVersion: 1,
    generator: "upscale",
    route: "router",
    model: "bfl/video-upscale-v1",
    open: false,
    camera: null,
    videoModel: "flux-3",
    controls: upscaleControls,
  },
  {
    // The first image entry: FLUX 3 Image Klein, open weights. This run is
    // Comfy's official Klein text-to-image graph on the workflow route (a local
    // ComfyUI or Comfy Cloud); see workflows/flux-3-klein-t2i.README.md.
    id: "flux-3-klein",
    label: "FLUX 3 Image Klein",
    task: "Image",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    open: true,
    generator: "image",
    route: "workflow",
    model: "workflow/flux-3-klein-t2i",
    camera: "flux-3",
    videoModel: "flux-3-klein",
    controls: kleinOpenControls,
  },
  {
    // The same model on BFL's hosted endpoint, POST /v1/flux-3-image-klein
    // (docs.bfl.ai, checked 21 October 2026). Router lists no Klein model, so
    // it runs on a BFL key only.
    id: "flux-3-klein-api",
    label: "FLUX 3 Image Klein",
    task: "Image · API",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    open: true,
    runOf: "flux-3-klein",
    generator: "image",
    route: "bfl",
    model: "flux-3-image-klein",
    camera: "flux-3",
    videoModel: "flux-3-klein-api",
    controls: kleinApiControls,
  },
  {
    id: "flux-3-image",
    label: "FLUX 3",
    task: "Image",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    open: false,
    generator: "image",
    route: "router",
    model: "bfl/flux-3-image",
    camera: "flux-3",
    videoModel: "flux-3",
    controls: fluxImageControls,
  },
  {
    id: "flux-3-edit",
    label: "FLUX 3",
    task: "Edit",
    family: "flux",
    status: "ready",
    recipeVersion: 1,
    open: false,
    generator: "edit",
    route: "router",
    model: "bfl/flux-3-image",
    camera: "flux-3",
    videoModel: "flux-3",
    controls: fluxImageControls,
  },
  {
    id: "flux-3-omni",
    label: "FLUX 3 Omni",
    family: "flux",
    status: "coming",
    open: false,
    note: "FLUX 3 Omni: not released",
  },
  {
    // Music from a caption and lyrics: Comfy's official MiniMax Music 3
    // graph on the workflow route; see workflows/minimax-music-3.README.md.
    // It sits under H3 as one of its generators until music has a section.
    id: "minimax-music-3",
    label: "MiniMax Music 3",
    task: "Text to music",
    credit: "MiniMax-Music3",
    // The hosted copy step stores MP4s and stills only.
    localOnly: true,
    family: "h3",
    status: "ready",
    recipeVersion: 1,
    open: true,
    generator: "audio",
    route: "workflow",
    model: "workflow/minimax-music-3",
    camera: null,
    videoModel: "minimax-music-3",
    controls: musicControls,
  },
];

export const openEntries = (entries = registry) =>
  entries.filter((e) => e.open);

export const familyOf = (entry: Entry): Family => entry.family;

/** The menu line for an entry: its name, then what it makes. */
export const entryLabel = (entry: Entry) =>
  entry.task ? `${entry.label} · ${entry.task}` : entry.label;

/** The menu's filters: Open only, the hosted studio, and the Local tick's rule. */
export interface MenuFilter {
  openOnly?: boolean;
  hosted?: boolean;
  deploymentRegistered?: boolean;
  /** With Local ticked, only what can run on the local ComfyUI is kept. */
  keep?: (entry: Entry) => boolean;
}

/**
 * A family's menu rows in order; with `openOnly`, closed ones are gone. A
 * second run of a model (`runOf`) is not a row of its own.
 */
export const entriesFor = (
  family: Family,
  {
    openOnly = false,
    hosted = false,
    keep,
    deploymentRegistered = false,
  }: MenuFilter = {},
  entries = registry,
) =>
  entries.filter(
    (e) =>
      e.family === family &&
      !e.runOf &&
      (!openOnly || e.open) &&
      !(hosted && e.localOnly) &&
      (!e.deploymentOnly || deploymentRegistered) &&
      (!keep || keep(e)),
  );

/** The menu row an entry is shown under: its own, or the model it runs. */
export const menuId = (entry: Entry) => entry.runOf ?? entry.id;

/**
 * The two ways to run a model that offers both, and which one is held: the
 * open graph (`open`) and the hosted API (`api`). Null for every other entry.
 */
export function runOptions(entry: Entry) {
  const open = readyEntry(menuId(entry));
  const api = registry.find(
    (e): e is ReadyEntry => e.status === "ready" && e.runOf === open?.id,
  );
  if (!open || !api) return null;
  return { open, api, held: entry.id === api.id ? "api" : "open" } as const;
}

/** The families the switch offers: those with something that can run. */
export const familiesFor = (filter: MenuFilter = {}) =>
  (["ltx", "flux", "h3", "upscale"] as const).filter((family) =>
    entriesFor(family, filter).some((e) => e.status === "ready"),
  );

/**
 * A family's name in the menu: the maker's line in capitals, or "Upscale".
 * The switch draws Upscale as an icon only, so the Family box keeps its width.
 */
export const familyName = (family: Family) =>
  family === "upscale" ? "Upscale" : family.toUpperCase();

export const readyEntry = (id: string): ReadyEntry | undefined => {
  const entry = registry.find((e) => e.id === id);
  return entry?.status === "ready" ? entry : undefined;
};

/** Where the open-only toggle moves a composer that held a closed entry. */
export const OPEN_DEFAULT = "ltx-2-5-fast";
/** Where it moves one that held a closed image entry: open Klein. */
export const OPEN_IMAGE_DEFAULT = "flux-3-klein";
/** Where it moves one that held the closed upscaler: SeedVR2. */
export const OPEN_UPSCALE_DEFAULT = "seedvr2-upscale";

/**
 * The ACOUSTIC SPACE switch moves between these two entries: on is the
 * AKUSPACE workflow, off is plain LTX-2.5 Fast. It shows on either, and on
 * no other entry.
 */
export const ACOUSTIC_PAIR = {
  off: "ltx-2-5-fast",
  on: "ltx-2-5-akuspace",
} as const;
export const acousticSwitch = (entry: Entry) =>
  entry.id === ACOUSTIC_PAIR.off || entry.id === ACOUSTIC_PAIR.on
    ? { on: entry.id === ACOUSTIC_PAIR.on }
    : null;

/**
 * The entry the composer holds. An old run with no model is FLUX 3; an upscale
 * is FLUX Video Upscale whatever video model the composer last held, unless
 * that model is the open upscaler's (`seedvr2-upscale`). A pair
 * no entry makes (Klein asked for video or an edit) is the generator's FLUX 3
 * entry, so a half-made selection can never resolve to nothing. Music has no
 * FLUX entry: any model asked of it is MiniMax Music 3, its only entry.
 */
export const entryFor = (
  generator: Generator,
  model: VideoModel = "flux-3",
): ReadyEntry => {
  const find = (wanted?: VideoModel) =>
    registry.find(
      (e): e is ReadyEntry =>
        e.status === "ready" &&
        e.generator === generator &&
        (!wanted || e.videoModel === wanted),
    );
  return (find(model) ?? find("flux-3") ?? find())!;
};

/** What a family switch lands on: the family's first ready video entry, or its first ready entry. */
export const familyDefault = (family: Family): ReadyEntry =>
  (registry.find(
    (e): e is ReadyEntry =>
      e.family === family && e.status === "ready" && e.generator === "video",
  ) ??
    registry.find(
      (e): e is ReadyEntry => e.family === family && e.status === "ready",
    ))!;

/**
 * What choosing a menu row sets in the composer, or null when the row cannot
 * run. A `coming` entry has no generator or model to give, so it can never
 * become a request.
 */
export function selectionFor(
  id: string,
): { generator: Generator; model: VideoModel } | null {
  const entry = readyEntry(id);
  return entry ? { generator: entry.generator, model: entry.videoModel } : null;
}
