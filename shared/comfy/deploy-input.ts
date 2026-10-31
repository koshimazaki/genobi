import { AppError } from "../../server/errors";
import { isDeployModel } from "./deploy-catalogue";
import type { GenerateInput } from "../types";

/** Asset tickets are issued by the local studio; never URLs or credentials. */
export interface DeployInput {
  seed: number;
  negativePrompt: string;
  recipe?: string;
  assets: Record<string, string>;
}
export const DEPLOY_FILE_TOKENS = [
  "TAKE_WEBM",
  "DEPTH_WEBM",
  "REFERENCE_PNG",
  "FIRST_FRAME_PNG",
  "TRACK_AUDIO",
] as const;
export const deployInvalid = (message: string) =>
  new AppError(400, message, "invalid_deployment_input");

/** Port of materialize-ltx.py's capture/seed checks; filenames use asset tickets. */
export function readDeployInput(value: unknown): DeployInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw deployInvalid("Attach the deployment inputs first.");
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.seed) || (v.seed as number) < 0)
    throw deployInvalid("Seed must be a nonnegative safe JSON integer.");
  if (
    typeof v.negativePrompt !== "string" ||
    new TextEncoder().encode(v.negativePrompt).length > 12000 ||
    /__[A-Z0-9_]+__/.test(v.negativePrompt)
  )
    throw deployInvalid(
      "Keep the negative prompt under 12,000 UTF-8 bytes without placeholders.",
    );
  if (!v.assets || typeof v.assets !== "object" || Array.isArray(v.assets))
    throw deployInvalid("Attach the workflow's input files.");
  const assets: Record<string, string> = {};
  for (const [name, id] of Object.entries(v.assets)) {
    if (
      !(DEPLOY_FILE_TOKENS as readonly string[]).includes(name) ||
      typeof id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(id)
    )
      throw deployInvalid("Invalid deployment input file.");
    assets[name] = id;
  }
  if (v.recipe !== undefined) {
    if (
      typeof v.recipe !== "string" ||
      new TextEncoder().encode(v.recipe).length > 64000 ||
      /__[A-Z0-9_]+__/.test(v.recipe)
    )
      throw deployInvalid("Attach a capture recipe under 64 KB.");
    let recipe: Record<string, unknown>;
    try {
      recipe = JSON.parse(v.recipe);
    } catch {
      throw deployInvalid("The capture recipe must be JSON.");
    }
    if (
      !recipe ||
      typeof recipe !== "object" ||
      Array.isArray(recipe) ||
      Object.entries({
        version: 1,
        fps: 24,
        width: 1024,
        height: 576,
        frames: 193,
      }).some(([k, n]) => recipe[k] !== n)
    )
      throw deployInvalid(
        "Use the matching v1, 24 fps, 1024 × 576, 193-frame capture recipe.",
      );
    if (Object.hasOwn(recipe, "motion"))
      throw deployInvalid(
        "Animated scene guides need a workflow with dynamic sound support. This combined deployment uses static room acoustics. Download the RGB/depth guides for a custom workflow instead.",
      );
  }
  return {
    seed: v.seed as number,
    negativePrompt: v.negativePrompt,
    assets,
    ...(v.recipe === undefined ? {} : { recipe: v.recipe as string }),
  };
}

export function requireDeployGeometry(input: GenerateInput) {
  if (!isDeployModel(input.model)) return;
  const seconds = 8;
  if (
    input.duration !== seconds ||
    input.aspectRatio !== "16:9" ||
    input.resolution !== "hd" ||
    input.draft
  )
    throw deployInvalid(
      `This template uses its fixed ${seconds}-second, landscape recipe.`,
    );
}
