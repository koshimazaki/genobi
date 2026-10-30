import {
  chainShapeError,
  MAX_CHAIN_STAGES,
  type ChainStage,
} from "../shared/chain";
import {
  isOutputTarget,
  OUTPUT_TARGETS,
  resolveTarget,
  type OutputTargetId,
} from "../shared/output-targets";
import { entryFor } from "../shared/registry";
import type { GenerateInput } from "../shared/types";
import { AppError } from "./errors";
import { validateInput } from "./validation";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Stands in for the source a consuming stage will read, so `validateInput`
 * checks the rest of the stage. It never reaches storage: the stage is stored
 * without a source, and `stageInput` adds the real one at its pause.
 */
const PENDING_SOURCE = "chain-pending-source";

/** One stage through the same allowlist a single submission takes. */
function validateStage(index: number, body: unknown, consumes?: number) {
  try {
    if (consumes === undefined) return validateInput(body);
    if (record(body) && body.sourceId !== undefined)
      throw new AppError(
        400,
        `It reads stage ${consumes + 1}, so it takes no source of its own.`,
      );
    const { sourceId: _pending, ...input } = validateInput({
      ...(record(body) ? body : {}),
      sourceId: PENDING_SOURCE,
    });
    return input as GenerateInput;
  } catch (error) {
    if (error instanceof AppError)
      throw new AppError(
        error.status,
        `Stage ${index + 1}: ${error.message}`,
        error.code,
      );
    throw error;
  }
}

function readConsumes(index: number, value: unknown) {
  if (index === 0) {
    if (value !== undefined)
      throw new AppError(400, "Stage 1 reads no earlier stage.");
    return undefined;
  }
  if (value === undefined) return index - 1;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= index
  )
    throw new AppError(
      400,
      `Stage ${index + 1}: name an earlier stage to read, counting from 0.`,
    );
  return value;
}

/**
 * The upscale a target appends after the stage it shaped: FLUX Video Upscale,
 * reading that stage, labelled with its description. The camera fields only
 * satisfy the allowlist; an upscale sends no camera.
 */
function upscaleAfter(shaped: GenerateInput, factor: number) {
  return {
    generator: "upscale",
    description: shaped.description,
    ...(shaped.camera
      ? { camera: shaped.camera, cameraEdits: shaped.cameraEdits }
      : { presetId: shaped.presetId, cameraText: shaped.cameraText }),
    cameraEnabled: false,
    // An upscale reads its measured source; these only pass the allowlist.
    duration: Math.min(20, Math.max(5, shaped.duration)),
    resolution: shaped.resolution,
    aspectRatio: shaped.aspectRatio,
    draft: false,
    upscaleFactor: factor,
    upscaleCreativity: 0,
    ...(shaped.projectRevision === undefined
      ? {}
      : { projectRevision: shaped.projectRevision }),
  };
}

/**
 * Applies an output target: it shapes the last video stage and decides the
 * final stage. A target names the frame the chain finishes on, so when the
 * video stage already makes it, nothing may follow; when it needs the
 * upscaler, a final upscale reading it gets the target's amount, or one is
 * appended.
 */
function applyTarget(target: OutputTargetId, stages: ChainStage[]) {
  const at = stages.map((stage) => stage.input.generator).lastIndexOf("video");
  if (at < 0)
    throw new AppError(400, "An output target shapes a video stage; add one.");
  const input = stages[at].input;
  const resolved = resolveTarget(target, entryFor("video", input.model), input);
  stages[at] = {
    ...stages[at],
    input: validateStage(at, resolved.value, stages[at].consumes),
  };
  const after = stages.slice(at + 1);
  if (resolved.upscaleFactor === null) {
    if (after.length)
      throw new AppError(
        400,
        `The ${target} target is reached by stage ${at + 1}; remove the stages after it.`,
      );
    return stages;
  }
  const last = after.at(-1);
  if (
    after.length === 1 &&
    last!.input.generator === "upscale" &&
    last!.consumes === at
  ) {
    last!.input = { ...last!.input, upscaleFactor: resolved.upscaleFactor };
    return stages;
  }
  if (after.length)
    throw new AppError(
      400,
      `The ${target} target finishes on one upscale of stage ${at + 1}.`,
    );
  if (stages.length >= MAX_CHAIN_STAGES)
    throw new AppError(
      400,
      `The ${target} target adds an upscale stage; keep the chain under ${MAX_CHAIN_STAGES} stages.`,
    );
  return [
    ...stages,
    {
      input: validateStage(
        stages.length,
        upscaleAfter(stages[at].input, resolved.upscaleFactor),
        at,
      ),
      consumes: at,
    },
  ];
}

/** `POST /api/chains` on both adapters: every stage, its reading and the target. */
export function validateChain(value: unknown): {
  stages: ChainStage[];
  target?: OutputTargetId;
} {
  if (!record(value)) throw new AppError(400, "Expected a chain request.");
  const raw = value.stages;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_CHAIN_STAGES)
    throw new AppError(
      400,
      `A chain has between one and ${MAX_CHAIN_STAGES} stages.`,
    );
  if (value.target !== undefined && !isOutputTarget(value.target))
    throw new AppError(
      400,
      `Choose an output target: ${OUTPUT_TARGETS.join(", ")}.`,
    );
  let stages: ChainStage[] = raw.map((item: unknown, index) => {
    if (!record(item))
      throw new AppError(400, `Stage ${index + 1}: expected a stage.`);
    const consumes = readConsumes(index, item.consumes);
    return {
      input: validateStage(index, item.input, consumes),
      ...(consumes === undefined ? {} : { consumes }),
    };
  });
  const shapeError = chainShapeError(stages);
  if (shapeError) throw new AppError(400, shapeError);
  if (value.target !== undefined) {
    stages = applyTarget(value.target as OutputTargetId, stages);
    const shaped = chainShapeError(stages);
    if (shaped) throw new AppError(400, shaped);
  }
  return {
    stages,
    ...(value.target === undefined
      ? {}
      : { target: value.target as OutputTargetId }),
  };
}
