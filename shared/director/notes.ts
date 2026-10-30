// Frame notes: a comment pinned to a composition frame and, optionally, to one
// layer ("move the HUD lower", "extend this title by a beat"). The person
// leaves them while reviewing an agent's edit; the agent reads them back from
// `genobi_project` and acts on them. They live in the manifest
// (`project.notes`), so Save JSON, Download bundle, Open bundle and the
// project copy keep them with no file of their own.
//
// The three note commands (`add-note`, `resolve-note`, `delete-note`) are
// parsed and applied here for `commands.ts`; the studio's note list sends the
// same commands, so a note is written the same way whoever adds it.
import { clean, isObject, layerOf, refuse } from "./layer-commands";
import type { Note, Project } from "./types";

/** Notes a project holds; the schema's `maxItems` says the same. */
export const NOTE_LIMIT = 200;
/** A note's length in characters; the schema's `maxLength` says the same. */
export const NOTE_TEXT_LIMIT = 500;
/** `Date.prototype.toISOString`'s shape: UTC, seconds, optional milliseconds. */
export const NOTE_TIME =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/;
export const NOTE_AUTHORS = ["person", "agent"] as const;

export type NoteCommand =
  | {
      op: "add-note";
      noteId: string;
      frame: number;
      text: string;
      layerId?: string;
      author?: Note["author"];
      createdAt?: string;
    }
  /** `resolved` defaults to true; false reopens the note. */
  | { op: "resolve-note"; noteId: string; resolved?: boolean }
  | { op: "delete-note"; noteId: string };
export type NoteOp = NoteCommand["op"];

/** Required, then optional fields beyond `op`, per note command. */
export const NOTE_FIELDS: Record<NoteOp, [string[], string[]]> = {
  "add-note": [
    ["noteId", "frame", "text"],
    ["layerId", "author", "createdAt"],
  ],
  "resolve-note": [["noteId"], ["resolved"]],
  "delete-note": [["noteId"], []],
};
export const isNoteOp = (op: string): op is NoteOp =>
  Object.hasOwn(NOTE_FIELDS, op);

/** A note's words: control characters become spaces, then trimmed. */
export function noteText(value: unknown): string {
  const text =
    typeof value === "string" && value.length <= NOTE_TEXT_LIMIT
      ? clean(value)
      : "";
  if (!text) refuse(`text must be 1 to ${NOTE_TEXT_LIMIT} characters`);
  return text;
}

/**
 * The note-only fields of a note command: text, author, creation time and
 * resolved. `commands.ts` has already checked the ids, the frame and which
 * fields the op takes.
 */
export function readNoteFields(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (value.text !== undefined) out.text = noteText(value.text);
  if (value.author !== undefined) {
    if (!NOTE_AUTHORS.includes(value.author as never))
      refuse("author must be person or agent");
    out.author = value.author;
  }
  if (value.createdAt !== undefined) {
    const at = value.createdAt;
    if (
      typeof at !== "string" ||
      !NOTE_TIME.test(at) ||
      Number.isNaN(Date.parse(at))
    )
      refuse("createdAt must be a UTC time such as 2026-10-21T09:30:00.000Z");
    out.createdAt = at;
  }
  if (value.resolved !== undefined) {
    if (typeof value.resolved !== "boolean")
      refuse("resolved must be true or false");
    out.resolved = value.resolved;
  }
  return out;
}

function noteOf(project: Project, id: string) {
  return (
    project.notes?.find((n) => n.id === id) ??
    refuse(`No note ${id} in this project`)
  );
}
const withNotes = (project: Project, notes: Note[]): Project => {
  const { notes: _notes, ...rest } = project;
  // No notes left reads as an older bundle: the field goes, not an empty list.
  return notes.length ? { ...rest, notes } : rest;
};

/** The project after one note command. Pure, like every Director command. */
export function applyNoteCommand(project: Project, c: NoteCommand): Project {
  const notes = project.notes ?? [];
  switch (c.op) {
    case "add-note": {
      if (notes.length >= NOTE_LIMIT)
        refuse(`A project holds at most ${NOTE_LIMIT} notes`);
      if (notes.some((n) => n.id === c.noteId))
        refuse(`Note id ${c.noteId} is taken`);
      if (c.frame >= project.composition.durationFrames)
        refuse(
          `frame must be before the project's ${project.composition.durationFrames} frames`,
        );
      // A note may name a locked layer: it asks for a change, it makes none.
      if (c.layerId !== undefined) layerOf(project, c.layerId);
      const note: Note = {
        id: c.noteId,
        frame: c.frame,
        ...(c.layerId !== undefined ? { layerId: c.layerId } : {}),
        text: c.text,
        ...(c.author ? { author: c.author } : {}),
        ...(c.createdAt ? { createdAt: c.createdAt } : {}),
      };
      return withNotes(project, [...notes, note]);
    }
    case "resolve-note": {
      const { resolved: _resolved, ...note } = noteOf(project, c.noteId);
      const next = c.resolved === false ? note : { ...note, resolved: true };
      return withNotes(
        project,
        notes.map((n) => (n.id === c.noteId ? next : n)),
      );
    }
    case "delete-note":
      noteOf(project, c.noteId);
      return withNotes(
        project,
        notes.filter((n) => n.id !== c.noteId),
      );
  }
}

/** The studio's own edit of a note's words; agents delete and add instead. */
export function editNoteText(
  project: Project,
  id: string,
  text: unknown,
): Project {
  const words = noteText(text);
  noteOf(project, id);
  return withNotes(
    project,
    (project.notes ?? []).map((n) => (n.id === id ? { ...n, text: words } : n)),
  );
}

/**
 * Notes after layers were removed: a note on a layer that is gone stays at
 * its frame and loses only the layer, so feedback is never dropped silently.
 */
export function keepNotes(project: Project): Project {
  if (!project.notes) return project;
  const ids = new Set(project.layers.map((l) => l.id));
  return withNotes(
    project,
    project.notes.map((n) => {
      if (n.layerId === undefined || ids.has(n.layerId)) return n;
      const { layerId: _layerId, ...rest } = n;
      return rest;
    }),
  );
}

/** Count, unique ids, a frame inside the composition and a layer that exists. */
export function checkNotes(p: Project) {
  const notes = p.notes ?? [];
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (!Array.isArray(notes) || notes.length > NOTE_LIMIT)
    fail(`A project holds at most ${NOTE_LIMIT} notes`);
  const ids = new Set<string>();
  const layers = new Set(p.layers.map((l) => l.id));
  for (const n of notes) {
    if (!isObject(n)) fail("A note must be an object");
    if (ids.has(n.id)) fail(`Duplicate note ${n.id}`);
    ids.add(n.id);
    if (n.frame >= p.composition.durationFrames)
      fail(`Note ${n.id} is after the composition's last frame`);
    if (n.layerId !== undefined && !layers.has(n.layerId))
      fail(`Note ${n.id} names no layer ${n.layerId}`);
  }
}
