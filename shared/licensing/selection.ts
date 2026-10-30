import type { Entry } from "../registry";

export const modelFamilies = ["any", "flux", "ltx", "h3", "upscale"] as const;
export const weightPreferences = ["any", "open-weights", "commercial"] as const;
export const executionPreferences = ["any", "local", "cloud"] as const;
export const agentPreferences = ["any", "hermes", "claude", "codex"] as const;

/** Creative model selection is separate from licence eligibility and spending. */
export interface SelectionPreference {
  family?: (typeof modelFamilies)[number];
  weights?: (typeof weightPreferences)[number];
  execution?: (typeof executionPreferences)[number];
  agent?: (typeof agentPreferences)[number];
}
const choices = {
  family: modelFamilies,
  weights: weightPreferences,
  execution: executionPreferences,
  agent: agentPreferences,
};
export function parseSelection(value: unknown): SelectionPreference {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid model selection preference");
  const input = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const candidate = input[key];
    if (candidate === undefined) continue;
    if (
      typeof candidate !== "string" ||
      !(choices[key] as readonly string[]).includes(candidate)
    )
      throw new Error(`Invalid model selection ${key}`);
    output[key] = candidate;
  }
  return output as SelectionPreference;
}

/** Static capability, not evidence that credentials, models or a GPU are ready. */
export function runLocations(entry: Entry): ("local" | "cloud")[] {
  if (entry.status !== "ready") return [];
  return entry.route === "workflow" ? ["local", "cloud"] : ["cloud"];
}
/**
 * Whether an entry is in a preferred family. The menu files both upscalers
 * under Upscale, but FLUX Video Upscale is still BFL's model (`bfl/` on
 * Router, the provenance card's rule), so a saved "flux" keeps it. SeedVR2
 * is ByteDance's, so "flux" no longer takes it.
 */
function inFamily(entry: Entry, family: string) {
  return (
    entry.family === family ||
    (family === "flux" &&
      entry.status === "ready" &&
      entry.model.startsWith("bfl/"))
  );
}
export function matchesSelection(entry: Entry, value: SelectionPreference) {
  const preference = parseSelection(value);
  return (
    (!preference.family ||
      preference.family === "any" ||
      inFamily(entry, preference.family)) &&
    (preference.weights !== "open-weights" || entry.open) &&
    (preference.weights !== "commercial" || !entry.open) &&
    (!preference.execution ||
      preference.execution === "any" ||
      runLocations(entry).includes(preference.execution))
  );
}
