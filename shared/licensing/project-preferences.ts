import { parseSelection, type SelectionPreference } from "./selection";
import { parseUsage, type UsagePreference } from "./types";

/** Only explicit project choices; session intent stays in the session prompt. */
export interface ProjectPreferences {
  selection?: SelectionPreference;
  usage?: UsagePreference;
}
export function parseProjectPreferences(value: unknown): ProjectPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Project preferences must be an object");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => key !== "selection" && key !== "usage"))
    throw new Error("Project preferences take selection and usage only");
  return {
    ...(v.selection === undefined
      ? {}
      : { selection: parseSelection(v.selection) }),
    ...(v.usage === undefined ? {} : { usage: parseUsage(v.usage) }),
  };
}
export function resolvePreferences(
  defaults: ProjectPreferences,
  project?: ProjectPreferences,
): ProjectPreferences {
  return {
    ...(defaults.selection || project?.selection
      ? { selection: { ...defaults.selection, ...project?.selection } }
      : {}),
    ...(project?.usage || defaults.usage
      ? { usage: { ...(project?.usage ?? defaults.usage)! } }
      : {}),
  };
}
