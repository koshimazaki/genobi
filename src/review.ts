import { resolveTarget, type OutputTargetId } from "../shared/output-targets";
import { entryFor } from "../shared/registry";
import { takeUpscale } from "../shared/review";
import type { GenerateInput, Job, Source } from "../shared/types";
import type { ChainBody } from "./chain-client";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "./useComposer";

/**
 * Fast: the composer's run as stage 1, finished on the chosen target. The
 * server shapes the video stage to the target's ratio and size and appends
 * the upscale the target needs (after a Draft, which runs at HD, or always for
 * Big screen), so the stages the person approves are the server's, not a
 * guess made here.
 */
export const fastChain = (
  input: GenerateInput,
  target: OutputTargetId,
): ChainBody => ({ stages: [{ input }], target });

/** A ready video take the Studio review step can continue. */
export const reviewable = (job: Job | undefined) =>
  job?.generator === "video" &&
  job.status === "Ready" &&
  job.mediaAvailable !== false;

/** The measured clip a ready take saved: its asset id is the job's id. */
export const takeSource = (job: Job, sources: Source[]) =>
  sources.find(
    (source) => source.id === job.id && source.origin === "generated",
  );

/**
 * Studio: after review, one upscale of the take, at the amount the target
 * needs. Built through the composer's own restore and request path, so it is
 * the request a gallery Upscale of this take would send.
 */
export function studioUpscale(
  job: Job,
  source: Source,
  target: OutputTargetId,
): ChainBody | { reason: string } {
  const plan = takeUpscale(target, source);
  if (!plan.ok) return { reason: plan.reason };
  const restored = composerReducer(initialComposer, { type: "restore", job });
  const input = composerInput({
    ...composerReducer(restored, {
      type: "update",
      patch: {
        generator: "upscale",
        sourceId: job.id,
        upscaleFactor: plan.factor,
        upscaleCreativity: 0,
        upscalePrompt: "",
      },
    }),
  });
  return {
    stages: [
      {
        input: {
          ...input,
          description: source.label || "Upscale",
          // An upscale is priced from its measured source; this field only
          // passes the allowlist's 5–20 s rule, as `upscaleAfter` sets it, so
          // a 2–4 s LTX take can be quoted.
          duration: Math.min(20, Math.max(5, input.duration)),
        },
      },
    ],
  };
}

/** The ratio and resolution a Fast run is sent at, and why the toolbar shows them. */
export interface FrameLock {
  aspectRatio: GenerateInput["aspectRatio"];
  resolution: GenerateInput["resolution"];
  note: string;
}

/**
 * The frame Fast's video stage is made at: the server shapes it to the target
 * (`resolveTarget`, the rule `validateChain` applies) and fits it to the held
 * entry, so Social on LTX is 16:9 and a Draft runs at HD. The toolbar shows
 * these instead of the composer's own ratio and resolution, which Studio keeps.
 */
export function fastFrame(
  target: OutputTargetId,
  composer: Pick<
    ComposerState,
    | "model"
    | "duration"
    | "aspectRatio"
    | "resolution"
    | "draft"
    | "cameraEnabled"
    | "acoustic"
  >,
): FrameLock | null {
  const entry = entryFor("video", composer.model);
  if (entry.controls.kind !== "video") return null;
  const { value } = resolveTarget(target, entry, {
    duration: composer.duration,
    aspectRatio: composer.aspectRatio,
    resolution: composer.resolution,
    draft: composer.draft,
    cameraEnabled: composer.cameraEnabled,
    acoustic: composer.acoustic,
  });
  return {
    aspectRatio: value.aspectRatio,
    resolution: value.resolution,
    note: "Fast makes the frame the Finish at target sets. Switch to Studio to choose it here.",
  };
}
