import {
  akuspaceValues,
  akuspaceWorkflow,
  ltxWorkflow,
} from "./comfy/akuspace";
import { fitControls } from "./controls";
import { estimateUpscaleOutput } from "./presets";
import type { ReadyEntry } from "./registry";
import type { AspectRatio, GenerateInput, VideoResolution } from "./types";

/**
 * Output targets: the frame a chain finishes on. A target shapes the chain's
 * last video stage (its ratio and resolution, fitted to the entry's controls
 * as `fitControls` fits the composer) and says whether an upscale stage must
 * follow it to reach the frame.
 *
 * - `phone`: 9:16 at 1080p.
 * - `social`: 1:1 at 1080p. 4:5 is the common feed ratio, but no entry takes
 *   it (`AspectRatio` has no 4:5), so a 4:5 target would always be fitted
 *   to something else. 1:1 is a ratio FLUX 3 makes as asked.
 * - `1080p`: 16:9 at 1920 × 1080.
 * - `big-screen`: 16:9 at the largest size the upscaler allows. The video stage
 *   runs at QHD, 2560 × 1440, the largest input `checkUpscaleLimits` accepts,
 *   and FLUX Video Upscale finishes it at BFL's output ceiling
 *   (`estimateUpscaleOutput`). The amount comes from the frame the entry
 *   really makes (`effectiveFrame`): Acoustic Space caps QHD at 2.1 MP, where
 *   2× cannot reach the ceiling, so it gets 3×.
 */
export const OUTPUT_TARGETS = [
  "phone",
  "social",
  "1080p",
  "big-screen",
] as const;
export type OutputTargetId = (typeof OUTPUT_TARGETS)[number];

export interface OutputTarget {
  id: OutputTargetId;
  label: string;
  aspectRatio: AspectRatio;
  /** What the shaped video stage asks for. */
  resolution: VideoResolution;
  /** Big screen: always finish on the upscaler at its largest output. */
  largest: boolean;
}

export const outputTargets: Record<OutputTargetId, OutputTarget> = {
  phone: {
    id: "phone",
    label: "Phone",
    aspectRatio: "9:16",
    resolution: "fhd",
    largest: false,
  },
  social: {
    id: "social",
    label: "Social",
    aspectRatio: "1:1",
    resolution: "fhd",
    largest: false,
  },
  "1080p": {
    id: "1080p",
    label: "1080p",
    aspectRatio: "16:9",
    resolution: "fhd",
    largest: false,
  },
  "big-screen": {
    id: "big-screen",
    label: "Big screen",
    aspectRatio: "16:9",
    resolution: "qhd",
    largest: true,
  },
};

export const isOutputTarget = (value: unknown): value is OutputTargetId =>
  OUTPUT_TARGETS.includes(value as OutputTargetId);

/** The short edge each resolution names: 720p, 1080p, 1440p and 2160p. */
export const SHORT_EDGE: Record<VideoResolution, number> = {
  hd: 720,
  fhd: 1080,
  qhd: 1440,
  uhd: 2160,
};

/** The upscale amounts `validateInput` accepts, and the studio's fader offers. */
export const UPSCALE_FACTOR = { min: 1.5, max: 3 } as const;

/** Half steps (1.5, 2, 2.5, 3), rounded up so the frame is reached. */
export const upscaleStep = (factor: number) =>
  Math.min(
    UPSCALE_FACTOR.max,
    Math.max(UPSCALE_FACTOR.min, Math.ceil(factor * 2 - 1e-9) / 2),
  );

/** The exact 16:9 preset size, including aligned native-workflow dimensions. */
export function effectiveFrame(
  entry: Pick<ReadyEntry, "model">,
  resolution: VideoResolution,
) {
  if (
    entry.model === `workflow/${akuspaceWorkflow.id}` ||
    entry.model === `workflow/${ltxWorkflow.id}`
  ) {
    const { width, height } = akuspaceValues(
      { duration: 5, aspectRatio: "16:9", resolution },
      "",
      () => 0,
    );
    return { width, height };
  }
  const edge = SHORT_EDGE[resolution];
  return { width: Math.round((edge * 16) / 9), height: edge };
}

type Fitted = Pick<
  GenerateInput,
  "duration" | "aspectRatio" | "resolution" | "draft" | "cameraEnabled"
> &
  Pick<GenerateInput, "acoustic">;

export interface ResolvedTarget<T> {
  /** The shaped stage's values, fitted to its entry. */
  value: T;
  /** The upscale amount the final stage needs, or null when none follows. */
  upscaleFactor: number | null;
  /** The short edge the chain finishes on, in pixels. */
  shortEdge: number;
}

/**
 * The values a video stage takes for `id` on `entry`, fitted to its controls,
 * and the upscale that must follow it. A draft runs at HD whatever it names
 * (`validateInput`), so a drafted phone, social or 1080p stage needs a 1.5×
 * upscale to reach 1080p, and a drafted big-screen stage a 3× one.
 */
export function resolveTarget<T extends Fitted>(
  id: OutputTargetId,
  entry: Pick<ReadyEntry, "model" | "controls">,
  value: T,
): ResolvedTarget<T> {
  const { controls } = entry;
  if (controls.kind !== "video")
    throw new Error("An output target shapes a video stage.");
  const target = outputTargets[id];
  const fitted = fitControls(controls, {
    ...value,
    aspectRatio: target.aspectRatio,
    resolution: target.resolution,
  });
  const shaped: T = fitted.draft ? { ...fitted, resolution: "hd" } : fitted;
  const edge = SHORT_EDGE[shaped.resolution];
  if (target.largest) {
    // The 16:9 frame the stage makes, then the most the upscaler returns from it.
    const source = effectiveFrame(entry, shaped.resolution);
    const reach = estimateUpscaleOutput(source, UPSCALE_FACTOR.max);
    const factor = upscaleStep(reach.effectiveFactor);
    return {
      value: shaped,
      upscaleFactor: factor,
      shortEdge: estimateUpscaleOutput(source, factor).height,
    };
  }
  const wanted = SHORT_EDGE[target.resolution];
  if (edge >= wanted)
    return { value: shaped, upscaleFactor: null, shortEdge: edge };
  const factor = upscaleStep(wanted / edge);
  return {
    value: shaped,
    upscaleFactor: factor,
    shortEdge: Math.floor(edge * factor),
  };
}
