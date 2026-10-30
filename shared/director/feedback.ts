// Feedback for the agent: what the person changed since the agent's revision,
// as Director commands the agent can apply, plus the open frame notes and
// what no command can express. The agent's revision is kept in the manifest
// (`project.feedbackBase`): the project as an agent's last command left it,
// or as an agent wrote it into a bundle. The local server records it when it
// applies a command
// from the copy's command route (and when an agent hands in a take), and the
// studio records the same when the copy's stream announces that command, so
// both hold the same base.
//
// Round trip: an agent edits → the person adjusts in the Director and pins
// notes → `projectFeedback` diffs the base against the current project
// (`feedback-diff.ts`) → the agent reads it (`genobi_project_feedback`, the
// Feedback panel's JSON, or `feedback.json` in a saved bundle) and applies
// it, which records a new base.
import {
  applyCommand,
  DIRECTOR_ID,
  parseCommand,
  type CommandResult,
  type DirectorCopy,
} from "./commands";
import {
  diffCopies,
  LABEL_LIMIT,
  UNMAPPED_KINDS,
  type LabelledCommand,
  type Unmapped,
} from "./feedback-diff";
import { isObject } from "./layer-commands";
import { NOTE_AUTHORS, NOTE_LIMIT, NOTE_TEXT_LIMIT, NOTE_TIME } from "./notes";
import type { Note, Project } from "./types";

export { diffCopies, startingCopy } from "./feedback-diff";
export { sameCopy } from "./feedback-residual";
export type { LabelledCommand, Unmapped } from "./feedback-diff";

export const FEEDBACK_SCHEMA = "genobi.director-feedback.v1";
/** More than the diff can make: 128 layers and 200 notes, a few each. */
export const FEEDBACK_COMMAND_LIMIT = 2048;
export const FEEDBACK_UNMAPPED_LIMIT = 2048;
/** The file name a saved bundle writes the feedback under. */
export const FEEDBACK_PATH = "feedback.json";
/**
 * The agent's revision, as compact JSON, at most: the same 1 MB a manifest
 * is held to, on top of it, so a project with its base always reopens.
 */
export const FEEDBACK_BASE_BYTES = 1024 * 1024;

/** A value's size as compact UTF-8 JSON; no TextEncoder in `shared/`. */
export function jsonBytes(value: unknown): number {
  const text = JSON.stringify(value) ?? "";
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    // A surrogate pair is one four-byte character.
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export interface DirectorFeedback {
  schema: typeof FEEDBACK_SCHEMA;
  projectId: string;
  /** The agent's revision; null when the project has none yet. */
  baseRevision: number | null;
  revision: number;
  commands: LabelledCommand[];
  /** The notes still open, in the order they were added. */
  notes: Note[];
  unmapped: Unmapped[];
}

/**
 * The project with the copy recorded as the agent's revision. A revision
 * over `FEEDBACK_BASE_BYTES` is not kept (the project then has none, and the
 * feedback says so) rather than writing a bundle that could not reopen.
 */
export function recordFeedbackBase(copy: DirectorCopy): DirectorCopy {
  const { feedbackBase: _old, ...rest } = copy.project;
  // A detached snapshot: later edits never reach into the base.
  const base = {
    project: JSON.parse(JSON.stringify(rest)) as Project,
    prompt: copy.prompt,
  };
  if (jsonBytes(base) > FEEDBACK_BASE_BYTES) return { ...copy, project: rest };
  return { ...copy, project: { ...rest, feedbackBase: base } };
}

/**
 * An earlier state of a project brought back (Undo) with the newest agent's
 * revision either state holds: undoing past an agent's edit rejects it, and
 * that rejection is feedback, so the base it is measured from stays.
 */
export function keepNewestBase(restored: Project, current: Project): Project {
  const now = current.feedbackBase;
  if (
    !now ||
    restored.id !== current.id ||
    (restored.feedbackBase?.project.revision ?? 0) >= now.project.revision
  )
    return restored;
  return { ...restored, feedbackBase: now };
}

/**
 * An agent's Director command: `applyCommand`, then the result recorded as
 * the agent's revision. Pure, so the server and the studio agree.
 */
export function applyAgentCommand(
  copy: DirectorCopy,
  value: unknown,
): CommandResult {
  const result = applyCommand(copy, value);
  return result.ok
    ? { ok: true, copy: recordFeedbackBase(result.copy) }
    : result;
}

/** The feedback for a copy: changes since its base, or none without one. */
export function projectFeedback(copy: DirectorCopy): DirectorFeedback {
  const { project } = copy;
  const base = project.feedbackBase;
  const diff = base ? diffCopies(base, copy) : { commands: [], unmapped: [] };
  return {
    schema: FEEDBACK_SCHEMA,
    projectId: project.id,
    baseRevision: base ? base.project.revision : null,
    revision: project.revision,
    commands: diff.commands,
    notes: (project.notes ?? []).filter((n) => !n.resolved),
    unmapped: diff.unmapped,
  };
}

// Reading a feedback file someone else wrote: type, length and counts.
const fail = (message: string): never => {
  throw new Error(`Invalid feedback: ${message}`);
};
// Control characters are refused on purpose, as the bundle schema does.
const CONTROL = /[\x00-\x1f\x7f]/;
const revision = (v: unknown, name: string) =>
  Number.isSafeInteger(v) && (v as number) >= 1
    ? (v as number)
    : fail(`${name} must be a revision`);
function words(v: unknown, name: string, max: number) {
  if (typeof v !== "string" || !v || v.length > max || CONTROL.test(v))
    fail(`${name} must be 1 to ${max} characters of text`);
  return v as string;
}
function exact(
  v: unknown,
  name: string,
  required: string[],
  optional: string[] = [],
) {
  if (!isObject(v)) return fail(`${name} must be an object`);
  const extra = Object.keys(v).find(
    (k) => !required.includes(k) && !optional.includes(k),
  );
  if (extra) fail(`${name} has an unknown field ${extra.slice(0, 40)}`);
  const missing = required.find((k) => v[k] === undefined);
  if (missing) fail(`${name} needs ${missing}`);
  return v;
}
function list(v: unknown, name: string, max: number) {
  if (!Array.isArray(v) || v.length > max)
    fail(`${name} must be a list of at most ${max}`);
  return v as unknown[];
}
function readNote(v: unknown): Note {
  const n = exact(
    v,
    "note",
    ["id", "frame", "text"],
    ["layerId", "author", "createdAt", "resolved"],
  );
  for (const key of ["id", "layerId"])
    if (
      n[key] !== undefined &&
      (typeof n[key] !== "string" || !DIRECTOR_ID.test(n[key]))
    )
      fail(`note ${key} must be a lowercase id`);
  if (!Number.isSafeInteger(n.frame) || (n.frame as number) < 0)
    fail("note frame must be a whole frame");
  words(n.text, "note text", NOTE_TEXT_LIMIT);
  if (n.author !== undefined && !NOTE_AUTHORS.includes(n.author as never))
    fail("note author must be person or agent");
  if (
    n.createdAt !== undefined &&
    (typeof n.createdAt !== "string" || !NOTE_TIME.test(n.createdAt))
  )
    fail("note createdAt must be a UTC time");
  if (n.resolved !== undefined && n.resolved !== false)
    fail("feedback lists open notes only");
  return n as unknown as Note;
}

/** A feedback file from untrusted data, or an error saying what is wrong. */
export function parseFeedback(value: unknown): DirectorFeedback {
  const v = exact(value, "feedback", [
    "schema",
    "projectId",
    "baseRevision",
    "revision",
    "commands",
    "notes",
    "unmapped",
  ]);
  if (v.schema !== FEEDBACK_SCHEMA) fail(`schema must be ${FEEDBACK_SCHEMA}`);
  if (typeof v.projectId !== "string" || !DIRECTOR_ID.test(v.projectId))
    fail("projectId must be a project id");
  const base =
    v.baseRevision === null ? null : revision(v.baseRevision, "baseRevision");
  const now = revision(v.revision, "revision");
  if (base !== null && base > now) fail("baseRevision is after revision");
  const commands = list(v.commands, "commands", FEEDBACK_COMMAND_LIMIT).map(
    (c) => {
      const item = exact(c, "command entry", ["command", "label"]);
      let command;
      try {
        command = parseCommand(item.command);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      return { command, label: words(item.label, "label", LABEL_LIMIT) };
    },
  );
  if (base === null && commands.length) fail("commands need a baseRevision");
  const notes = list(v.notes, "notes", NOTE_LIMIT).map(readNote);
  if (new Set(notes.map((n) => n.id)).size !== notes.length)
    fail("notes repeat an id");
  const unmapped = list(v.unmapped, "unmapped", FEEDBACK_UNMAPPED_LIMIT).map(
    (u) => {
      const item = exact(u, "unmapped entry", [
        "kind",
        "id",
        "field",
        "label",
        "reason",
      ]);
      if (!UNMAPPED_KINDS.includes(item.kind as never))
        fail(`unmapped kind must be one of ${UNMAPPED_KINDS.join(", ")}`);
      return {
        kind: item.kind as Unmapped["kind"],
        id: words(item.id, "unmapped id", 64),
        field: words(item.field, "unmapped field", 64),
        label: words(item.label, "unmapped label", LABEL_LIMIT),
        reason: words(item.reason, "unmapped reason", LABEL_LIMIT),
      };
    },
  );
  return {
    schema: FEEDBACK_SCHEMA,
    projectId: v.projectId as string,
    baseRevision: base,
    revision: now,
    commands,
    notes,
    unmapped,
  };
}
