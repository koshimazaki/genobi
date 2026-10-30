import type { ImageAspectRatio, ImageResolution } from "./image";
import type { CameraSelection, CameraEdits } from "./camera";
import type { PresetId } from "./legacy-camera";
import type { AcousticSetting } from "./acoustic";
import type { LtxPrompt } from "./ltx-prompt";
/** `audio`: music from a caption and lyrics (MiniMax Music 3 on the workflow route). */
export type Generator = "video" | "upscale" | "image" | "edit" | "audio";
/**
 * Which model a run targets; the name predates stills. FLUX 3 runs on BFL
 * direct or Comfy Router; LTX-2.5 Fast and Pro on Router; LTX-2.5 with the
 * AKUSPACE LoRA (Acoustic Space) as a Comfy Cloud workflow. FLUX 3 Image Klein
 * makes stills two ways: `flux-3-klein` is the open-weights graph on the
 * workflow route, `flux-3-klein-api` is BFL's hosted Klein endpoint. MiniMax
 * H3 runs guided as four Cloud OmniRef workflows (`minimax-h3*`) and, from two
 * reference images alone, on Router (`minimax-h3-router`).
 * `minimax-music-3` makes music, not video: the open graph on the workflow route.
 * `openjutsu-swap` is Comfy's Openjutsu character swap (MiniMax H3), run on
 * its own Comfy deployment (`shared/openjutsu.ts`).
 * `seedvr2-upscale` is the open upscaler: SeedVR2 on the workflow route
 * (`shared/comfy/seedvr2.ts`), upscale only.
 */
export type VideoModel =
  | "flux-3"
  | "flux-3-i2v"
  | "minimax-h3"
  | "minimax-h3-canny"
  | "minimax-h3-depth"
  | "minimax-h3-combined"
  | "minimax-h3-router"
  | "ltx-2.5"
  | "ltx-2.5-pro"
  | "ltx-2.5-open"
  | "ltx-2.5-akuspace"
  | "flux-3-klein"
  | "flux-3-klein-api"
  | "openjutsu-swap"
  | "minimax-music-3"
  | "seedvr2-upscale";
export type AspectRatio =
  "21:9" | "2:1" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
export type VideoResolution = "hd" | "fhd" | "qhd" | "uhd";
export type { PresetId } from "./legacy-camera";
export type JobStatus =
  | "submitting"
  | "Pending"
  | "Reasoning"
  | "Generating"
  | "copying"
  | "Ready"
  | "Error"
  | "expired"
  | "stopped"
  | "Request Moderated"
  | "Content Moderated";

export interface GenerateInput {
  generator: Generator;
  imageAspectRatio?: ImageAspectRatio;
  imageResolution?: ImageResolution;
  imageGrounding?: boolean;
  imageSafetyTolerance?: number;
  /** Request-only image data URLs; persisted jobs contain no reference bytes. */
  imageReferences?: string[];
  /** Absent on jobs recorded before the model switch: FLUX 3. */
  model?: VideoModel;
  description: string;
  /** Legacy job compatibility. New requests use camera. */
  presetId?: PresetId;
  camera?: CameraSelection;
  cameraEdits?: CameraEdits;
  cameraEnabled: boolean;
  cameraText?: string;
  duration: number;
  resolution: VideoResolution;
  aspectRatio: AspectRatio;
  draft: boolean;
  /**
   * The AKUSPACE treatment appended to the prompt, on the Acoustic Space
   * workflow only. Null or absent: none.
   */
  acoustic?: AcousticSetting | null;
  /**
   * LTX only: the main text, the four gaps and the Light choice the browser
   * composed `description` from, recorded so Recreate restores them as gaps.
   * Present, the description already holds the camera sentences and the
   * Acoustic Space caption in the LTX guide's order. Absent on every run
   * that used the main field alone.
   */
  ltxPrompt?: LtxPrompt;
  sourceId?: string;
  upscalePrompt?: string;
  upscaleFactor: number;
  upscaleCreativity: 0 | 1;
  /**
   * Music only: the song's lyrics with MiniMax's section tags (`[verse]`,
   * `[chorus]`, `[Instrumental]`). The caption is `description`. Absent on
   * every other run.
   */
  lyrics?: string;
  /** The Director project revision this run is for; recorded in its take. */
  projectRevision?: number;
  /** The Openjutsu character swap's own settings; that model only. */
  swap?: SwapSettings;
}

/**
 * Where the swapped part starts in the clip (seconds, two decimals), the
 * size H3 prepares it at, the seed, and the items the first frame's boxes
 * changed when they were items (a hat, a shirt), not the whole person. The
 * part's length is `duration`; the direction is `description`.
 */
export interface SwapSettings {
  start: number;
  size: 480 | 768;
  seed: number;
  items?: string[];
}

/**
 * The run that produced a catalogue clip, shipped with it so Recreate and
 * prompt reuse work on a library clip exactly as on a visitor's own job.
 */
export interface LibrarySetup extends GenerateInput {
  /** The composed prompt the provider received, recorded verbatim. */
  prompt: string;
  /** Provider-confirmed charge for the original run. */
  costUsd: number;
  generatedAt: string;
}

export interface Source {
  /** Absent on video sources recorded before images and audio. */
  mediaType?: "video" | "image" | "audio";
  contentType?: string;
  id: string;
  label: string;
  url: string;
  poster?: string;
  width: number;
  height: number;
  duration: number;
  /** `derived`: cut, framed, joined or crossfaded from other sources by the local media service. */
  origin: "sample" | "upload" | "generated" | "derived";
  /** Present on catalogue clips only; uploads and generations have their own job. */
  setup?: LibrarySetup;
  /** A catalogue clip made outside the studio: the video model that made it, with no setup. */
  model?: VideoModel;
  /** That clip's provenance line from the catalogue, sanitised; it has no prompt. */
  about?: string;
}

/**
 * How long a run usually takes once the provider has it, as Comfy Router
 * reports on its status read while a run is in progress: the median and the
 * 90th percentile in whole seconds, measured on recent runs (`historical`) or
 * a per-media fallback (`default`). Not time remaining, never queue time.
 */
export interface DurationEstimate {
  seconds: number;
  p90Seconds?: number;
  source: "historical" | "default";
}

export interface Job extends GenerateInput {
  mediaType?: "video" | "image" | "audio";
  imageReferenceCount?: number;
  resultContentType?: string;
  id: string;
  prompt: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  costEstimateUsd: number;
  costActualUsd?: number;
  /** Comfy credits a Router run reported in its result header. */
  costCredits?: number;
  resultUrl?: string;
  /** False when retention or quota kept the run record but removed its media. */
  mediaAvailable?: false;
  error?: string;
  progress?: number;
  /** Router's duration estimate for this run, while it was in progress. */
  estimate?: DurationEstimate;
  /**
   * Whose key paid: the studio's own demo key (`server`, held to the demo
   * budget), a key the visitor sent with the request (`byo`), or a key the
   * local server's owner saved in the Keychain (`owner`).
   */
  keyMode: KeyMode;
  /**
   * Local server only: who made the run when it was not the studio itself,
   * from the request's own marks: the Genobi CLI (`terminal`) or an MCP
   * client (`agent`). It describes the caller and grants nothing. The hosted
   * Worker never sets it.
   */
  origin?: JobOrigin;
  /**
   * Local server only: a take another session on this machine made from a
   * terminal or an agent, listed in the studio's history so the person sees
   * it (`server/shared-takes.ts`). The hosted Worker never sets it.
   */
  shared?: true;
}
export type JobOrigin = "terminal" | "agent";
export type KeyMode = "server" | "byo" | "owner";

export const terminalStatuses: readonly JobStatus[] = [
  "Ready",
  "Error",
  "expired",
  "stopped",
  "Request Moderated",
  "Content Moderated",
];
export const isTerminal = (status: JobStatus) =>
  terminalStatuses.includes(status);

/**
 * Every video path in the studio (upscale, Director media, Dual Swords) must
 * see only video. Sources before images and audio carry no media type.
 */
export const isVideoSource = (source: Pick<Source, "mediaType">) =>
  (source.mediaType ?? "video") === "video";
