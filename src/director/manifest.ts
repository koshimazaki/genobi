import { FEEDBACK_BASE_BYTES, jsonBytes } from "../../shared/director/feedback";
import type { Project } from "../../shared/director/types";
import { validateProject } from "./validate";

// `project.json`, written and read in one place so the two limits agree. The
// project is held to 1 MB as compact JSON and the agent's revision it may
// carry (`feedbackBase`) to another 1 MB of its own, so recording a base
// never makes a project that opened too large to open again.

/** The project without its agent's revision, as compact JSON. */
export const MANIFEST_BYTES = 1024 * 1024;
/** The file itself: room for both, readable indentation included. */
export const MANIFEST_FILE_BYTES = 4 * 1024 * 1024;

const bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * The manifest as Save JSON and Download bundle write it: indented, with the
 * agent's revision last on one line. Falls back to compact JSON, which the
 * two limits keep under the file limit, should indentation not fit.
 */
export function manifestText(project: Project): string {
  const { feedbackBase, ...rest } = project;
  const pretty = JSON.stringify(rest, null, 2);
  const text = feedbackBase
    ? `${pretty.slice(0, -2)},\n  "feedbackBase": ${JSON.stringify(feedbackBase)}\n}`
    : pretty;
  return bytes(text) <= MANIFEST_FILE_BYTES ? text : JSON.stringify(project);
}

/** A manifest from a file's bytes: sizes first, then every project check. */
export function readManifest(data: Uint8Array): Project {
  if (data.length > MANIFEST_FILE_BYTES)
    throw new Error("Manifest file limit is 4 MB");
  const value: unknown = JSON.parse(new TextDecoder().decode(data));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { feedbackBase: _base, ...rest } = value as Record<string, unknown>;
    if (jsonBytes(rest) > MANIFEST_BYTES)
      throw new Error(
        `Manifest limit is 1 MB, with ${FEEDBACK_BASE_BYTES / 1024 / 1024} MB more for the agent's revision`,
      );
  }
  return validateProject(value);
}
