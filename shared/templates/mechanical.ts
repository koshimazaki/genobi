import { h3RouterResolution, isH3Router } from "../comfy/h3-router";
import { durationRange, fitControls } from "../controls";
import type { AspectRatio, GenerateInput, VideoResolution } from "../types";
import { planTemplate } from "./plan";
import { isMechanical } from "./run-kind";
import type { HouseTemplate } from "./types";

/**
 * A mechanical template's one run, as the gallery sends it: the planner's
 * shot (`planTemplate`, the same one the Director and the agent read) with
 * the person's prompt, length and ratio, and their references in the order
 * the shot names them. The request is the Camera's own `GenerateInput`, so
 * it is quoted, reserved and submitted by the same routes and the same
 * validator as a Camera run (tests/template-mechanical.test.ts).
 */

/** The server's description limit (`server/validation.ts`). */
export const PROMPT_LIMIT = 1200;

/** What the person can change in the drawer. */
export interface MechanicalRecipe {
  prompt: string;
  aspect: AspectRatio;
  duration: number;
}

/**
 * The drawer's starting recipe: the planned prompt at the default inputs, or
 * a generation card's own prompt as written (empty until the owner gives one)
 * at its recorded ratio and length, when the owner recorded them.
 */
export function mechanicalDefaults(template: HouseTemplate): MechanicalRecipe {
  const aspect = template.generation?.settings?.aspect;
  const [shot] = mechanicalPlan(template, aspect).shots;
  return {
    prompt: template.generation ? template.generation.prompt : shot.prompt,
    aspect: shot.input.aspectRatio!,
    duration: shot.input.duration,
  };
}

/** A generation card's recorded resolution, else the planned one. */
const resolutionOf = (template: HouseTemplate, planned: VideoResolution) =>
  template.generation?.settings?.resolution ?? planned;

/** The lengths and ratios the shot's entry offers, for the drawer's controls. */
export function mechanicalControls(template: HouseTemplate) {
  const [shot] = mechanicalPlan(template).shots;
  const { duration } = shot.entry.controls as Extract<
    typeof shot.entry.controls,
    { kind: "video" }
  >;
  const { min, max } = durationRange(duration);
  const lengths =
    "choices" in duration
      ? [...duration.choices]
      : Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const { model } = shot.input;
  const resolution = resolutionOf(template, shot.input.resolution);
  return {
    entry: shot.entry,
    /** The recipe's resolution, in the provider's own words. */
    resolution: isH3Router(model)
      ? h3RouterResolution(resolution)
      : resolution.toUpperCase(),
    lengths,
    aspects: template.inputs.aspects,
  };
}

function mechanicalPlan(template: HouseTemplate, aspect?: AspectRatio) {
  if (!isMechanical(template))
    throw new Error(`${template.name} runs through an agent session`);
  return planTemplate(template, aspect ? { aspect } : {});
}

// Control characters become spaces; the prompt stays one paragraph.
const clean = (text: string) =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The run's request. Refuses an empty or over-long prompt, a ratio the
 * template does not offer, a length its entry does not, and a reference list
 * that is not one data URL per reference the shot carries. Validation of the
 * images themselves (type, size, 256 px a side) is the server's, as for a
 * Camera run.
 */
export function mechanicalInput(
  template: HouseTemplate,
  recipe: MechanicalRecipe,
  references: readonly string[],
): GenerateInput {
  const plan = mechanicalPlan(template, recipe.aspect);
  const [shot] = plan.shots;
  const prompt = clean(typeof recipe.prompt === "string" ? recipe.prompt : "");
  if (!prompt || prompt.length > PROMPT_LIMIT)
    throw new Error(`Write a prompt of 1 to ${PROMPT_LIMIT} characters.`);
  if (
    references.length !== shot.references.length ||
    references.some(
      (r) => typeof r !== "string" || !r.startsWith("data:image/"),
    )
  )
    throw new Error(
      `${template.name} takes ${shot.references.length} images, in order.`,
    );
  const input: GenerateInput = {
    ...shot.input,
    resolution: resolutionOf(template, shot.input.resolution),
    description: prompt,
    duration: recipe.duration,
    imageReferences: [...references],
  };
  if (
    !Number.isInteger(recipe.duration) ||
    fitControls(shot.entry.controls, input) !== input
  )
    throw new Error(`${shot.entry.label} cannot make that length or ratio.`);
  return input;
}
