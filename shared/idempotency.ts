import { presets } from "./legacy-camera";
import type { GenerateInput } from "./types";

/** The `Idempotency-Key` both adapters accept, and the MCP server checks first. */
export const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{8,100}$/;

/**
 * One replay rule for both backends.
 *
 * A repeated `Idempotency-Key` must return the original job when the settings
 * match and 409 when they differ. The Worker used to compare the stored JSON
 * string while Express compared a normalised subset of it, so the same replay
 * could pass locally and conflict in production.
 *
 * Fields are read in a fixed order, gaps left by older jobs are filled with the
 * defaults a new request would receive, and absent is treated as undefined.
 * A field no longer read is not compared: runs recorded while Audio was a
 * switch carry `audio`, and replay with or without it, since every run now
 * asks for audio.
 */
const FIELDS = [
  "generator",
  "model",
  "description",
  "presetId",
  "cameraText",
  "camera",
  "cameraEdits",
  "cameraEnabled",
  "duration",
  "resolution",
  "aspectRatio",
  "draft",
  "sourceId",
  "upscalePrompt",
  "upscaleFactor",
  "upscaleCreativity",
  "acoustic",
  // The gaps a composed LTX paragraph was built from; absent otherwise.
  "ltxPrompt",
  "imageAspectRatio",
  "imageResolution",
  "imageGrounding",
  "imageSafetyTolerance",
  "imageReferences",
  // A take names the revision it was made for, so a replay for another
  // revision is a different request. Runs before takes carried none.
  "projectRevision",
] as const satisfies readonly (keyof GenerateInput)[];

export function canonicalInput(input: Partial<GenerateInput>): string {
  const value: Partial<GenerateInput> = { ...input };
  value.aspectRatio ??= "16:9";
  value.model ??= "flux-3";
  value.upscaleCreativity ??= 0;
  // No treatment: every run before Acoustic Space, and every other entry.
  value.acoustic ??= null;
  // Jobs recorded before per-term editing stored a preset id and no wording.
  if (!value.camera)
    value.cameraText ??= presets.find((p) => p.id === value.presetId)?.clause;
  const values = FIELDS.map((field) => stable(value[field]));
  // Settings that close the list only where a run has them (a song's lyrics,
  // the swap's settings), so every hash recorded before they existed reads
  // the same.
  if (value.lyrics !== undefined) values.push(["lyrics", value.lyrics]);
  if (value.swap !== undefined) values.push(stable(value.swap));
  if (value.deploy !== undefined) values.push(stable(value.deploy));
  return JSON.stringify(values);
}

/** Key order inside camera, cameraEdits, acoustic and ltxPrompt must not decide whether a replay matches. */
function stable(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
