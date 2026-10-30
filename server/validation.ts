import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import {
  readDeployInput,
  requireDeployGeometry,
} from "../shared/comfy/deploy-input";
import { isH3, takesVideoReferences } from "../shared/h3";
import { isH3Router } from "../shared/comfy/h3-router";
import { validateVideoReferences } from "./validate-h3";
import { validateCamera } from "./validate-camera";
import { validateImage } from "./validate-image";
import { validateSwap } from "./validate-swap";
import { isSwap } from "../shared/openjutsu";
import { validateAudio } from "./validate-audio";
import { presets } from "../shared/presets";
import type {
  AspectRatio,
  GenerateInput,
  VideoResolution,
} from "../shared/types";
import { AppError } from "./errors";
import { entryFor } from "../shared/registry";
import { durationRange, fitControls } from "../shared/controls";
import { readAcoustic } from "../shared/acoustic";
import { composedRefusal, readLtxPrompt } from "../shared/ltx-prompt";
import { isLtxModel } from "../shared/camera";
import { IDEMPOTENCY_KEY } from "../shared/idempotency";
import { QUOTE_ID } from "../shared/quote";

const aspectRatios = new Set<AspectRatio>([
  "21:9",
  "2:1",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
]);
const resolutions = new Set<VideoResolution>(["hd", "fhd", "qhd", "uhd"]);

/** Director project revisions count up from zero; absent means none was named. */
function readProjectRevision(value: unknown) {
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new AppError(400, "Name a project revision as a whole number.");
  return { projectRevision: value };
}

/**
 * The parts of a composed LTX paragraph, recorded as sent and never composed
 * here: the browser wrote the description from them. LTX video only. With an
 * Acoustic Space treatment the description must carry its caption whole,
 * since the workflow's LoRA needs its trigger and the paragraph replaces the
 * caption the server would otherwise append.
 */
function readComposed(
  body: Record<string, unknown>,
  model: unknown,
  acoustic: GenerateInput["acoustic"],
) {
  if (body.ltxPrompt === undefined) return undefined;
  if (
    body.generator !== "video" ||
    !isLtxModel(model as GenerateInput["model"])
  )
    throw new AppError(400, "Prompt gaps are for LTX video only.");
  const refusal = composedRefusal(
    String(body.description),
    body.ltxPrompt,
    acoustic,
  );
  if (refusal) throw new AppError(400, refusal);
  return readLtxPrompt(body.ltxPrompt)!;
}

export function validateInput(value: unknown): GenerateInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Expected a generation request.");
  const body = value as Record<string, unknown>;
  const revision = readProjectRevision(body.projectRevision);
  if (body.generator === "image" || body.generator === "edit")
    return validateImage(body, revision);
  if (isSwap(body.model)) return validateSwap(body, revision);
  if (body.generator === "audio") return validateAudio(body, revision);
  if (body.generator !== "video" && body.generator !== "upscale")
    throw new AppError(400, "Choose a supported generator.");
  if (typeof body.description !== "string" || body.description.length > 1200)
    throw new AppError(400, "Keep the description under 1,200 characters.");
  if (body.generator === "video" && !body.description.trim())
    throw new AppError(400, "Describe the scene first.");
  if (
    body.cameraText !== undefined &&
    (typeof body.cameraText !== "string" || body.cameraText.length > 600)
  )
    throw new AppError(400, "Keep camera text under 600 characters.");
  if (
    body.upscalePrompt !== undefined &&
    (typeof body.upscalePrompt !== "string" || body.upscalePrompt.length > 1200)
  )
    throw new AppError(400, "Keep the upscale prompt under 1,200 characters.");
  const camera =
    body.camera === undefined
      ? undefined
      : validateCamera(body.camera, body.cameraEdits);
  // Every H3 entry takes the camera in H3's wording (`shared/camera-h3.ts`),
  // but needs none: its prompt may carry the camera as the person wrote it.
  // A term the H3 panel does not show is accepted here, as for LTX, and
  // `composePrompt` never writes it.
  if (
    !isH3(body.model) &&
    !isH3Router(body.model) &&
    !camera &&
    !presets.some((item) => item.id === body.presetId)
  )
    throw new AppError(400, "Choose a supported camera view.");
  if (
    typeof body.cameraEnabled !== "boolean" ||
    typeof body.draft !== "boolean"
  )
    throw new AppError(400, "Invalid camera or draft setting.");
  if (isDeployModel(body.model))
    requireDeployGeometry(body as unknown as GenerateInput);
  const model = body.model === undefined ? "flux-3" : body.model;
  if (
    !isDeployModel(model) &&
    model !== "flux-3" &&
    model !== "flux-3-i2v" &&
    model !== "ltx-2.5" &&
    model !== "ltx-2.5-pro" &&
    model !== "ltx-2.5-open" &&
    model !== "ltx-2.5-akuspace" &&
    model !== "minimax-h3" &&
    model !== "minimax-h3-canny" &&
    model !== "minimax-h3-depth" &&
    model !== "minimax-h3-combined" &&
    model !== "minimax-h3-router" &&
    model !== "seedvr2-upscale"
  )
    throw new AppError(400, "Choose FLUX 3, LTX-2.5 or H3.");
  // SeedVR2 upscales and does nothing else; an upscale is FLUX's or SeedVR2's.
  if (model === "seedvr2-upscale" && body.generator !== "upscale")
    throw new AppError(400, "SeedVR2 upscales video only.");
  if (
    !isDeployModel(model) &&
    model !== "flux-3" &&
    model !== "seedvr2-upscale" &&
    body.generator !== "video"
  )
    throw new AppError(400, "LTX generates video only.");
  // The registry entry's controls bound the request the way they bound the
  // composer: LTX takes Router's seconds from 2, FLUX the fader's 5 to 20.
  const controls = entryFor(body.generator, model).controls;
  // An upscale has no length of its own: the source clip sets it, and the
  // adapter measures that clip against the upscaler's limits
  // (`checkUpscaleLimits`) before any quote. The composer's fader value is
  // whatever the last video or music entry left (LTX's 4 s, Music 3's 120 s),
  // so it is not judged here; it is only kept to a whole second inside 5 to
  // 20, the range every upscale was recorded with, so replays still match.
  const duration =
    body.generator === "upscale"
      ? upscaleDuration(body.duration)
      : body.duration;
  const range =
    controls.kind === "video"
      ? durationRange(controls.duration)
      : { min: 5, max: 20 };
  if (
    typeof duration !== "number" ||
    !Number.isInteger(duration) ||
    duration < range.min ||
    duration > range.max
  )
    throw new AppError(
      400,
      `Choose a whole number of seconds between ${range.min} and ${range.max}.`,
    );
  // Every video run asks for audio, so a recorded or sent `audio` is ignored
  // like any other field this allowlist does not name.
  // A treatment is only accepted where the LoRA runs, and that workflow takes
  // nothing else: without a room it would be LTX-2.5 Fast.
  const acoustic =
    body.acoustic === undefined || body.acoustic === null
      ? null
      : readAcoustic(body.acoustic);
  if (acoustic === undefined)
    throw new AppError(400, "Choose a supported acoustic space.");
  const takesAcoustic = controls.kind === "video" && controls.acoustic;
  if (acoustic && !takesAcoustic)
    throw new AppError(400, "Acoustic Space runs on its own LTX-2.5 workflow.");
  if (takesAcoustic && !acoustic)
    throw new AppError(400, "Acoustic Space needs a space.");
  const ltxPrompt = readComposed(body, model, acoustic);
  if (
    typeof body.resolution !== "string" ||
    !resolutions.has(body.resolution as VideoResolution)
  )
    throw new AppError(400, "Choose HD, Full HD, QHD, or UHD resolution.");
  const aspectRatio =
    body.aspectRatio === undefined ? "16:9" : body.aspectRatio;
  if (
    typeof aspectRatio !== "string" ||
    !aspectRatios.has(aspectRatio as AspectRatio)
  )
    throw new AppError(400, "Choose a supported aspect ratio.");
  if (
    typeof body.upscaleFactor !== "number" ||
    !Number.isFinite(body.upscaleFactor) ||
    body.upscaleFactor < 1.5 ||
    body.upscaleFactor > 3
  )
    throw new AppError(400, "Choose an upscale amount between 1.5× and 3×.");
  const upscaleCreativity =
    body.upscaleCreativity === undefined ? 0 : body.upscaleCreativity;
  if (upscaleCreativity !== 0 && upscaleCreativity !== 1)
    throw new AppError(400, "Choose Precise or Creative upscaling.");
  if (
    (body.generator === "upscale" || isH3(model)) &&
    (typeof body.sourceId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(body.sourceId))
  ) {
    throw new AppError(400, "Choose a source video.");
  }
  // What the entry cannot take is moved to what it can, as the composer does,
  // so the recorded run says what the provider received: an LTX run at 7s is
  // 6s, at 21:9 is 16:9, and never a draft.
  const fitted = fitControls(controls, {
    duration,
    aspectRatio: aspectRatio as AspectRatio,
    resolution: body.resolution as VideoResolution,
    draft: body.generator === "video" && body.draft,
    cameraEnabled: body.generator === "video" && body.cameraEnabled,
  });
  const draft = fitted.draft;
  return {
    generator: body.generator,
    model,
    description: body.description.trim(),
    ...(camera ?? {
      presetId: body.presetId as GenerateInput["presetId"],
      cameraText: body.cameraText as string | undefined,
    }),
    cameraEnabled: fitted.cameraEnabled,
    duration: fitted.duration,
    resolution: draft ? "hd" : fitted.resolution,
    aspectRatio: fitted.aspectRatio,
    draft,
    ...(takesAcoustic ? { acoustic } : {}),
    ...(ltxPrompt ? { ltxPrompt } : {}),
    sourceId:
      body.generator === "upscale" || isH3(model)
        ? (body.sourceId as string)
        : undefined,
    ...(takesVideoReferences(model)
      ? {
          imageReferences: validateVideoReferences(body.imageReferences, model),
        }
      : {}),
    // SeedVR2's graph takes no prompt and has no Creative mode: the recorded
    // run says what it received.
    ...(body.upscalePrompt === undefined || model === "seedvr2-upscale"
      ? {}
      : { upscalePrompt: (body.upscalePrompt as string).trim() }),
    upscaleFactor: body.upscaleFactor,
    upscaleCreativity: model === "seedvr2-upscale" ? 0 : upscaleCreativity,
    ...(isDeployModel(model) ? { deploy: readDeployInput(body.deploy) } : {}),
    ...revision,
  };
}

/**
 * The nominal seconds an upscale records: nothing sent or priced reads it (the
 * provider and the estimate take the measured source), so a missing or
 * out-of-range value from another entry's fader is moved, not refused.
 */
function upscaleDuration(value: unknown) {
  const seconds =
    typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 5;
  return Math.min(20, Math.max(5, seconds));
}

export function validateIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value))
    throw new AppError(400, "A unique request identifier is required.");
  return value;
}

/** Absent is fine: only agents must quote first. Present, it must be ours. */
export function validateQuoteId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !QUOTE_ID.test(value))
    throw new AppError(400, "That quote id is not valid.", "quote_missing");
  return value;
}
