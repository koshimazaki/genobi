import type { AspectRatio, GenerateInput, VideoResolution } from "./types";
import { LTX_DURATIONS } from "./comfy/ltx";
import {
  H3_ROUTER_DURATION,
  H3_ROUTER_RATIOS,
  H3_ROUTER_RESOLUTIONS,
} from "./comfy/h3-router";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  KLEIN_RESOLUTIONS,
  type ImageAspectRatio,
  type ImageResolution,
} from "./image";
import { MUSIC_DURATION } from "./music";

/**
 * The composer controls a registry entry shows, and the choices each offers.
 * `GenerationControls` draws the row from this rather than from the generator,
 * and `fitControls` moves a value the entry cannot take to one it can, so the
 * controls on screen and the request that is sent describe the same run.
 */
export interface VideoControls {
  kind: "video";
  /** A fader range, or the fixed list of seconds a schema names. */
  duration: { min: number; max: number } | { choices: readonly number[] };
  aspectRatios: readonly AspectRatio[];
  resolutions: readonly VideoResolution[];
  draft: boolean;
  camera: boolean;
  /**
   * Takes an AKUSPACE treatment (`shared/acoustic.ts`). Only the Acoustic Space
   * workflow does: the LoRA is what makes the treatment mean anything.
   */
  acoustic: boolean;
}
/**
 * A still: BFL's image ratios and tiers, and no duration, draft or movement.
 * `camera` keeps the framing terms (shot size and angle) for entries whose
 * model is the video model's family; movement is video's alone.
 */
export interface ImageControls {
  kind: "image";
  aspectRatios: readonly ImageAspectRatio[];
  resolutions: readonly ImageResolution[];
  /** FLUX 3 Image's web grounding; Klein's schema has no such field. */
  grounding: boolean;
  camera: boolean;
  /** Reference images. The open Klein graph has no image inputs yet. */
  references: boolean;
}
/**
 * Music: a duration fader, a caption (the prompt field) and lyrics. No ratio,
 * resolution, draft or camera: a song has none.
 */
export interface AudioControls {
  kind: "audio";
  duration: { min: number; max: number };
  lyrics: boolean;
}
/** The upscale tool keeps its own amount and mode controls. */
export type Controls =
  VideoControls | ImageControls | AudioControls | { kind: "upscale" };
/** MiniMax Music 3: the studio's duration range, caption and lyrics. */
export const musicControls: AudioControls = {
  kind: "audio",
  duration: MUSIC_DURATION,
  lyrics: true,
};
/** FLUX 3 Image and Edit through Router or BFL: every ratio, four priced tiers. */
export const fluxImageControls: ImageControls = {
  kind: "image",
  aspectRatios: IMAGE_ASPECT_RATIOS,
  resolutions: IMAGE_RESOLUTIONS,
  grounding: true,
  camera: true,
  references: true,
};
/**
 * FLUX 3 Image Klein on BFL's endpoint: the same ratios and `auto`, its five
 * tiers, references (the first is the image edited), the camera's framing.
 */
export const kleinApiControls: ImageControls = {
  kind: "image",
  aspectRatios: IMAGE_ASPECT_RATIOS,
  resolutions: KLEIN_RESOLUTIONS,
  grounding: false,
  camera: true,
  references: true,
};
/**
 * The open Klein graph: the graph is sized by the studio, so a ratio is
 * always named (`auto` has nothing to read it from), and it takes no image
 * inputs until uploads reach the workflow route.
 */
export const kleinOpenControls: ImageControls = {
  ...kleinApiControls,
  aspectRatios: IMAGE_ASPECT_RATIOS.filter((ratio) => ratio !== "auto"),
  references: false,
};
/** Whether an entry's controls carry the camera at all. */
export const takesCamera = (controls: Controls) =>
  (controls.kind === "video" || controls.kind === "image") && controls.camera;

const allAspects: readonly AspectRatio[] = [
  "21:9",
  "2:1",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
];
const allResolutions: readonly VideoResolution[] = ["hd", "fhd", "qhd", "uhd"];

/**
 * FLUX 3 video: the studio's fader, every ratio BFL takes, and draft. Audio
 * is not a control: every video request asks for it (`generate_audio: true`).
 */
export const fluxVideoControls: VideoControls = {
  kind: "video",
  duration: { min: 5, max: 20 },
  aspectRatios: allAspects,
  resolutions: allResolutions,
  draft: true,
  camera: true,
  acoustic: false,
};
/**
 * LTX-2.5 through Router: the schema's duration list, landscape or portrait
 * only (`ltxResolution` maps every other ratio to landscape), and no draft
 * mode. Audio is always on, as for FLUX 3.
 */
export const ltxVideoControls: VideoControls = {
  kind: "video",
  duration: { choices: LTX_DURATIONS },
  aspectRatios: ["16:9", "9:16"],
  resolutions: allResolutions,
  draft: false,
  camera: true,
  acoustic: false,
};
/** Router Pro exposes 720p and 1080p only, as its live model schema states. */
export const ltxProControls: VideoControls = {
  ...ltxVideoControls,
  resolutions: ["hd", "fhd"],
};
/** The native graph supports the studio's shapes and explicit aligned sizes. */
export const ltxOpenControls: VideoControls = {
  ...ltxVideoControls,
  aspectRatios: allAspects,
  duration: { min: 2, max: 20 },
  acoustic: false,
};
export const ltxAcousticControls: VideoControls = {
  ...ltxOpenControls,
  acoustic: true,
};
/**
 * The proven OmniRef recipe: 124 frames at 24 fps, 1344 × 768. The camera
 * writes H3's sentences into the prompt (`shared/camera-h3.ts`); the guide
 * video still carries the motion it was made from.
 */
export const h3VideoControls: VideoControls = {
  kind: "video",
  duration: { choices: [5] },
  aspectRatios: ["16:9"],
  resolutions: ["hd"],
  draft: false,
  camera: true,
  acoustic: false,
};
/**
 * The Openjutsu swap: a 5 to 15 second part of the clip. Its frame comes
 * from the clip and its size (480 or 768) from the request's `swap`, so the
 * ratio and resolution here are placeholders the request does not read.
 */
export const swapControls: VideoControls = {
  kind: "video",
  duration: { min: 5, max: 15 },
  aspectRatios: ["16:9"],
  resolutions: ["hd"],
  draft: false,
  camera: false,
  acoustic: false,
};
/**
 * H3 on Router (`shared/comfy/h3-router.ts`): the schema's 4 to 15 seconds,
 * its six ratios, 768P (HD) or 2K (Full HD). The schema has no camera field,
 * so the camera panel's H3 sentences go into the prompt; no draft, no
 * treatment.
 */
export const h3RouterControls: VideoControls = {
  kind: "video",
  duration: H3_ROUTER_DURATION,
  aspectRatios: H3_ROUTER_RATIOS,
  resolutions: H3_ROUTER_RESOLUTIONS,
  draft: false,
  camera: true,
  acoustic: false,
};
export const upscaleControls: Controls = { kind: "upscale" };

export const durationRange = (duration: VideoControls["duration"]) =>
  "choices" in duration
    ? { min: duration.choices[0], max: duration.choices.at(-1)! }
    : duration;

/** The nearest offered duration; ties go to the shorter, cheaper clip, as `ltxDuration` does. */
export function fitDuration(
  duration: VideoControls["duration"],
  seconds: number,
): number {
  if (!("choices" in duration))
    return Math.min(duration.max, Math.max(duration.min, Math.round(seconds)));
  return duration.choices.reduce((best, item) =>
    Math.abs(item - seconds) < Math.abs(best - seconds) ? item : best,
  );
}

/** A ratio the entry cannot take falls to the offered one of the same orientation. */
export function fitAspect(
  offered: readonly AspectRatio[],
  aspect: AspectRatio,
): AspectRatio {
  if (offered.includes(aspect)) return aspect;
  const portrait = (ratio: AspectRatio) => {
    const [w, h] = ratio.split(":").map(Number);
    return w < h;
  };
  return (
    offered.find((item) => portrait(item) === portrait(aspect)) ?? offered[0]
  );
}

type Fitted = Pick<
  GenerateInput,
  "duration" | "aspectRatio" | "resolution" | "draft" | "cameraEnabled"
> &
  Pick<
    GenerateInput,
    "acoustic" | "imageAspectRatio" | "imageResolution" | "imageGrounding"
  >;

/** A still's ratio: `auto` where it is offered, else the nearest same-orientation ratio. */
function fitImageAspect(
  offered: readonly ImageAspectRatio[],
  ratio: ImageAspectRatio = "auto",
): ImageAspectRatio {
  if (offered.includes(ratio)) return ratio;
  if (ratio === "auto") return offered.includes("1:1") ? "1:1" : offered[0];
  return fitAspect(
    offered.filter((r): r is AspectRatio & ImageAspectRatio => r !== "auto"),
    ratio as AspectRatio,
  );
}

/**
 * The image half of `fitControls`; the video values are left for a video
 * entry. References are not dropped here: a run that takes none is sent none
 * (`composerInput`), and they are still there for a run that does.
 */
function fitImage<T extends Fitted>(controls: ImageControls, value: T): T {
  const fitted = {
    imageAspectRatio: fitImageAspect(
      controls.aspectRatios,
      value.imageAspectRatio,
    ),
    imageResolution: controls.resolutions.includes(
      value.imageResolution ?? "1k",
    )
      ? (value.imageResolution ?? "1k")
      : "1k",
    imageGrounding: controls.grounding && (value.imageGrounding ?? false),
  };
  const changed =
    fitted.imageAspectRatio !== (value.imageAspectRatio ?? "auto") ||
    fitted.imageResolution !== (value.imageResolution ?? "1k") ||
    fitted.imageGrounding !== (value.imageGrounding ?? false);
  return changed ? { ...value, ...fitted } : value;
}
/**
 * The values an entry can take, from the values the composer or a request
 * holds. Anything already offered is returned unchanged, so applying it twice
 * changes nothing; an upscale entry leaves the video settings alone. An
 * acoustic treatment is dropped by every entry without the control, upscale
 * included: without the LoRA it would describe nothing the run can do.
 */
export function fitControls<T extends Fitted>(controls: Controls, value: T): T {
  if (value.acoustic && !(controls.kind === "video" && controls.acoustic))
    value = { ...value, acoustic: null };
  if (controls.kind === "image") return fitImage(controls, value);
  if (controls.kind === "audio") {
    // A song keeps only its length; the video settings stay parked, as for a still.
    const duration = fitDuration(controls.duration, value.duration);
    return duration === value.duration ? value : { ...value, duration };
  }
  if (controls.kind !== "video") return value;
  const fitted = {
    duration: fitDuration(controls.duration, value.duration),
    aspectRatio: fitAspect(controls.aspectRatios, value.aspectRatio),
    resolution: controls.resolutions.includes(value.resolution)
      ? value.resolution
      : controls.resolutions[0],
    draft: controls.draft && value.draft,
    cameraEnabled: controls.camera && value.cameraEnabled,
  };
  const changed = (Object.keys(fitted) as (keyof typeof fitted)[]).some(
    (key) => fitted[key] !== value[key],
  );
  return changed ? { ...value, ...fitted } : value;
}
