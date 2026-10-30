import { describe, expect, it } from "vitest";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import {
  editNoteText,
  keepNotes,
  NOTE_LIMIT,
  NOTE_TEXT_LIMIT,
} from "../shared/director/notes";
import type { Note, Project } from "../shared/director/types";
import { bundleZip, importBundle } from "../src/director/bundle";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";

// Frame notes: an optional, additive `notes` list in the manifest, the three
// note commands, and notes surviving a save and a reopen.
const studio = (): Project => base().project;
const at = "2026-10-21T09:30:00.000Z";
const hud: Note = {
  id: "note-hud",
  frame: 30,
  layerId: "title",
  text: "Move the title lower",
  author: "person",
  createdAt: at,
};
const withNotes = (notes: unknown): unknown => ({ ...studio(), notes });
const copy = (notes?: Note[]): DirectorCopy => ({
  project: notes ? { ...studio(), notes } : studio(),
  prompt: "",
});
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(from.project.revision + 1);
  return result.copy;
}
function refused(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? "" : result.error;
}

describe("the notes field in the bundle schema", () => {
  it("leaves an older bundle valid and accepts a full note", () => {
    expect(() => validateProject(studio())).not.toThrow();
    expect(studio()).not.toHaveProperty("notes");
    const full = { ...hud, resolved: true };
    expect(validateProject(withNotes([full])).notes).toEqual([full]);
    // Only id, frame and text are required.
    expect(() =>
      validateProject(withNotes([{ id: "n", frame: 0, text: "x" }])),
    ).not.toThrow();
    expect(() => validateProject(withNotes([]))).not.toThrow();
  });

  it("refuses a note out of shape, out of range or naming nothing", () => {
    const note = (patch: Record<string, unknown>) => [{ ...hud, ...patch }];
    for (const [notes, why] of [
      [note({ text: "" }), "fewer than 1"],
      [note({ text: "x".repeat(NOTE_TEXT_LIMIT + 1) }), "more than 500"],
      [note({ text: "bell\x07" }), "pattern"],
      [note({ text: "two\nlines" }), "pattern"],
      [note({ id: "Note 1" }), "pattern"],
      [note({ frame: -1 }), ">= 0"],
      [note({ frame: 1.5 }), "integer"],
      [note({ frame: 180 }), "after the composition's last frame"],
      [note({ layerId: "hud" }), "names no layer hud"],
      [note({ author: "robot" }), "allowed values"],
      [note({ createdAt: "yesterday" }), "pattern"],
      [note({ resolved: "yes" }), "boolean"],
      [note({ colour: "red" }), "additional properties"],
      [[hud, hud], "Duplicate note"],
      [
        Array.from({ length: NOTE_LIMIT + 1 }, (_, i) => ({
          id: `n-${i}`,
          frame: 0,
          text: "x",
        })),
        "more than 200",
      ],
      ["notes", "array"],
    ] as const)
      expect(() => validateProject(withNotes(notes)), why).toThrow(
        new RegExp(why.replace(/[()]/g, "\\$&")),
      );
  });
});

describe("parsing note commands", () => {
  it("keeps a note's fields and cleans its words", () => {
    expect(
      parseCommand({
        op: "add-note",
        noteId: "note-1",
        frame: 12,
        text: "  extend\tthis title\x07by a beat ",
        layerId: "title",
        author: "agent",
        createdAt: at,
      }),
    ).toEqual({
      op: "add-note",
      noteId: "note-1",
      frame: 12,
      text: "extend this title by a beat",
      layerId: "title",
      author: "agent",
      createdAt: at,
    });
    expect(parseCommand({ op: "resolve-note", noteId: "note-1" })).toEqual({
      op: "resolve-note",
      noteId: "note-1",
    });
    expect(
      parseCommand({ op: "resolve-note", noteId: "note-1", resolved: false }),
    ).toEqual({ op: "resolve-note", noteId: "note-1", resolved: false });
    expect(parseCommand({ op: "delete-note", noteId: "note-1" })).toEqual({
      op: "delete-note",
      noteId: "note-1",
    });
  });

  it("refuses a malformed note command", () => {
    const add = (patch: Record<string, unknown>) => ({
      op: "add-note",
      noteId: "note-1",
      frame: 0,
      text: "Lower",
      ...patch,
    });
    for (const bad of [
      { op: "add-note", noteId: "note-1", frame: 0 },
      { op: "add-note", noteId: "note-1", text: "Lower" },
      add({ text: "x".repeat(NOTE_TEXT_LIMIT + 1) }),
      add({ text: " \x00\x1f " }),
      add({ text: 42 }),
      add({ frame: -1 }),
      add({ frame: 2.5 }),
      add({ frame: "12" }),
      add({ noteId: "../note" }),
      add({ layerId: "Title" }),
      add({ author: "owner" }),
      add({ createdAt: "2026-10-21" }),
      add({ createdAt: "2026-13-45T99:99:99Z" }),
      add({ resolved: true }),
      add({ startFrame: 0 }),
      { op: "resolve-note", noteId: "note-1", resolved: "yes" },
      { op: "resolve-note" },
      { op: "delete-note", noteId: "note-1", text: "x" },
    ])
      expect(() => parseCommand(bad), JSON.stringify(bad)).toThrow();
  });
});

describe("applying note commands", () => {
  it("adds a note one revision on, pinned to a frame and a layer", () => {
    const before = copy();
    const frozen = JSON.stringify(before);
    const next = ok(before, {
      op: "add-note",
      noteId: "note-hud",
      frame: 30,
      text: "Move the title lower",
      layerId: "title",
      author: "person",
      createdAt: at,
    });
    expect(next.project.notes).toEqual([hud]);
    expect(JSON.stringify(before)).toBe(frozen);
    // A locked layer can still be named: a note asks, it changes nothing.
    const locked = ok(next, {
      op: "add-note",
      noteId: "note-labels",
      frame: 0,
      text: "Labels read late",
      layerId: "labels",
    });
    expect(locked.project.notes?.map((n) => n.id)).toEqual([
      "note-hud",
      "note-labels",
    ]);
    expect(locked.project.notes?.[1]).toEqual({
      id: "note-labels",
      frame: 0,
      layerId: "labels",
      text: "Labels read late",
    });
  });

  it("refuses a frame past the end, an unknown layer, a taken id or one too many", () => {
    const add = (patch: Record<string, unknown>) => ({
      op: "add-note",
      noteId: "note-new",
      frame: 0,
      text: "x",
      ...patch,
    });
    expect(refused(copy(), add({ frame: 180 }))).toMatch(/before the .* 180/);
    expect(refused(copy(), add({ layerId: "hud" }))).toMatch(/No layer hud/);
    expect(refused(copy([hud]), add({ noteId: "note-hud" }))).toMatch(
      /note-hud is taken/,
    );
    const full = Array.from({ length: NOTE_LIMIT }, (_, i) => ({
      id: `n-${i}`,
      frame: 0,
      text: "x",
    }));
    expect(refused(copy(full), add({}))).toMatch(/at most 200 notes/);
  });

  it("resolves, reopens and deletes a note, and refuses an unknown one", () => {
    const resolved = ok(copy([hud]), { op: "resolve-note", noteId: hud.id });
    expect(resolved.project.notes).toEqual([{ ...hud, resolved: true }]);
    const reopened = ok(resolved, {
      op: "resolve-note",
      noteId: hud.id,
      resolved: false,
    });
    expect(reopened.project.notes).toEqual([hud]);
    const gone = ok(reopened, { op: "delete-note", noteId: hud.id });
    // The last note gone reads as a bundle that never had any.
    expect(gone.project).not.toHaveProperty("notes");
    expect({ ...gone.project, revision: 1 }).toEqual(studio());
    for (const op of ["resolve-note", "delete-note"])
      expect(refused(copy([hud]), { op, noteId: "note-x" })).toMatch(
        /No note note-x/,
      );
  });

  it("rewords a note in the studio and keeps notes when their layer goes", () => {
    const project = { ...studio(), notes: [hud] };
    expect(editNoteText(project, hud.id, " Lower\x07still ").notes).toEqual([
      { ...hud, text: "Lower still" },
    ]);
    expect(() => editNoteText(project, hud.id, " ")).toThrow(/1 to 500/);
    expect(() => editNoteText(project, "note-x", "x")).toThrow(/No note/);
    const layers = project.layers.filter((l) => l.id !== "title");
    const kept = keepNotes({ ...project, layers });
    const { layerId: _layerId, ...detached } = hud;
    expect(kept.notes).toEqual([detached]);
    expect(() => validateProject(kept)).not.toThrow();
    expect(keepNotes(studio())).toEqual(studio());
  });
});

describe("notes survive a save and a reopen", () => {
  it("keeps notes through Download bundle and Open bundle", async () => {
    const bundle = base();
    bundle.project = { ...bundle.project, notes: [{ ...hud, resolved: true }] };
    const zip = bundleZip(bundle);
    const reopened = await importBundle(
      new File([new Uint8Array(zip)], "saved.zip"),
    );
    expect(reopened.project).toEqual(bundle.project);
  });

  it("keeps notes through Save JSON reopened over the loaded media", async () => {
    const bundle = base();
    const saved = JSON.stringify({ ...bundle.project, notes: [hud] }, null, 2);
    const reopened = await importBundle(
      new File([saved], "project.json"),
      bundle,
    );
    expect(reopened.project.notes).toEqual([hud]);
  });
});
