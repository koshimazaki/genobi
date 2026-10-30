import { entryLabel, readyEntry, type ReadyEntry } from "../registry";
import type { HouseTemplate, MixUpscale } from "./types";

/**
 * A mix template's optional last step: upscale the rendered cut with a
 * registry upscaler (the Dimensions mix offers SeedVR2, the open one). It is
 * a step the person opts into, never part of opening or rendering the mix:
 * nothing here quotes or submits. The run itself is the Camera's upscale (or
 * an agent's `genobi_quote` then `genobi_submit` once the person approves),
 * quoted and confirmed like any other.
 */
export interface MixUpscaleStep {
  entry: ReadyEntry;
  factor: number;
  /** The step's name where it is offered: "Upscale with SeedVR2 (open)". */
  label: string;
}

/**
 * The template's upscale step, checked: the entry must be a ready `upscale`
 * entry and the amount inside its 1.5× to 3×. Undefined when the template
 * offers none. Throws on a broken declaration, so a test catches it.
 */
export function mixUpscaleStep(
  template: Pick<HouseTemplate, "id" | "mix">,
): MixUpscaleStep | undefined {
  const step: MixUpscale | undefined = template.mix?.upscale;
  if (!step) return undefined;
  const entry = readyEntry(step.entry);
  if (!entry || entry.generator !== "upscale")
    throw new Error(`${template.id}: ${step.entry} is not a ready upscaler`);
  if (!(step.factor >= 1.5 && step.factor <= 3))
    throw new Error(`${template.id}: upscale ${step.factor}× is outside 1.5–3`);
  if (step.optIn !== true)
    throw new Error(`${template.id}: a mix upscale must be opt-in`);
  return {
    entry,
    factor: step.factor,
    label: `Upscale with ${entry.label}${entry.open ? " (open)" : ""}`,
  };
}

/**
 * The line an agent reads about the step on a mix project: optional, only on
 * the person's request, after the cut is rendered, quoted and approved first.
 */
export function mixUpscaleLine(step: MixUpscaleStep): string {
  return `Optional last step, only if the person asks for it: once the cut is rendered to MP4, upscale it with ${entryLabel(step.entry)} (registry entry ${step.entry.id}, ${step.entry.open ? "open weights" : "closed API"}) at ${step.factor}×. Quote it with genobi_quote and wait for the person's approval; never start it on your own.`;
}
