import type { Generator, VideoModel } from "./types";
import type { Controls } from "./controls";

/**
 * Which guide's camera wording an entry speaks: BFL's, LTX's or MiniMax's
 * H3 guide. The same ids as VideoModel's families.
 */
export type CameraModel = "flux-3" | "ltx-2.5" | "minimax-h3";

/**
 * Two Comfy routes under one Comfy key: `router` for partner and Router-hosted
 * models (`shared/comfy/router.ts`), `workflow` for Genobi's own graphs through
 * `@comfyorg/sdk` (`shared/comfy/workflow.ts`), on Comfy Cloud, a Comfy API
 * deployment or a local ComfyUI (`shared/comfy/destination.ts`). Router cannot
 * run a graph or front Cloud. `bfl` is BFL's own API, not a Comfy route:
 * Klein's API runs there, and a FLUX Router entry (the upscale included) runs
 * there on a BFL key.
 */
export type Route = "router" | "workflow" | "bfl";
/**
 * The Model menu's families: a model maker's line (LTX, FLUX, H3), or a task
 * every maker's model shares. `upscale` holds both upscalers, SeedVR2
 * (ByteDance, open) and FLUX Video Upscale (BFL, API), side by side.
 */
export type Family = "ltx" | "flux" | "h3" | "upscale";
interface Common {
  id: string;
  /** The model's name, as its maker spells it. */
  label: string;
  /** What it makes, after the name in the menu: `LTX-2.5 Fast · Text to video`. */
  task?: string;
  family: Family;
  /**
   * Open weights. LTX-2.5 Fast and FLUX 3 Image Klein are open, whichever
   * route runs them; LTX-2.5 Pro (API only) and FLUX 3 are not.
   */
  open: boolean;
  /**
   * Set on a second way to run another entry's model: that entry's id. The
   * menu lists the model once, and the Run control moves between the two.
   * Each run stays its own entry, so a take records which one ran.
   */
  runOf?: string;
  /**
   * A name the model's licence requires the studio to display where the
   * model is chosen and on what it makes: the MiniMax-Music3 Community
   * License asks commercial products to show "MiniMax-Music3" (LICENCES.md).
   */
  credit?: string;
  /**
   * Runs on the local studio only: the hosted Worker refuses it
   * (`audio_local_only`, or `unsupported_model` for the swap), so the
   * hosted studio neither lists nor offers it.
   */
  localOnly?: true;
  /**
   * Set on an entry the composer cannot build a request for: where it runs
   * from instead. The Model menu shows the row disabled with this as its
   * title, and Generate stays off if a restored selection holds it.
   */
  outsideComposer?: string;
}
export interface ReadyEntry extends Common {
  status: "ready";
  /**
   * Recorded in every take this entry runs (`shared/take.ts`). Bump it when
   * the request the entry sends changes: its body, prompt composition or
   * pinned workflow, so two takes with one version were made the same way.
   */
  recipeVersion: number;
  generator: Generator;
  route: Route;
  /** Router: `{provider}/{model}`. BFL: the endpoint under `/v1`. Workflow: `workflow/{template id}`. */
  model: `${string}/${string}` | BflEndpoint;
  /** The camera wording the entry takes, or null for entries with no camera. */
  camera: CameraModel | null;
  /** The model a request carries. An upscale carries FLUX 3: the server reads LTX as video only. */
  videoModel: VideoModel;
  /** The composer controls the entry shows and their choices; see `shared/controls.ts`. */
  controls: Controls;
  // workflow, slots, requiredNodes, cost: phase 4
}
export interface ComingEntry extends Common {
  status: "coming";
  /** One line on why it cannot run yet, shown as the disabled row's title. */
  note: string;
}
export type Entry = ReadyEntry | ComingEntry;
/** BFL endpoints with no slash under `/v1`, named so a typo cannot pass. */
export type BflEndpoint = "flux-3-image-klein" | "flux-3-video";
