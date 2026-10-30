import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  applyAgentCommand,
  FEEDBACK_PATH,
  FEEDBACK_SCHEMA,
  parseFeedback,
  projectFeedback,
  recordFeedbackBase,
} from "../shared/director/feedback";
import { bundleZip, importBundle } from "../src/director/bundle";
import { validateProject } from "../src/director/validate";
import { agent, at, layer, person } from "./director-feedback-fixture";
import { base } from "./house-template-fixtures";

// The feedback file: the agent's revision recorded in the manifest, the
// feedback built from it, its reader, and both surviving a save and reopen.
const note = {
  id: "note-kick",
  frame: 60,
  layerId: "photo-1",
  text: "Earlier, on the kick",
  author: "person" as const,
  createdAt: at,
};
/** An agent's command, then the person's move and note. */
function reviewed() {
  const done = applyAgentCommand(agent(), {
    op: "set-placement",
    layerId: "title",
    scale: 1.2,
  });
  if (!done.ok) throw new Error(done.error);
  const project = done.copy.project;
  return {
    ...done.copy,
    project: {
      ...layer(project, "photo-1", { startFrame: 72 }),
      revision: project.revision + 2,
      notes: [note],
    },
  };
}

describe("the agent's revision", () => {
  it("is recorded by an agent's command and validates", () => {
    const done = applyAgentCommand(agent(), {
      op: "move-clip",
      layerId: "photo-1",
      startFrame: 66,
    });
    if (!done.ok) throw new Error(done.error);
    const { project } = done.copy;
    const snapshot = project.feedbackBase!.project;
    expect(snapshot.revision).toBe(project.revision);
    expect(snapshot.feedbackBase).toBeUndefined();
    expect(project.feedbackBase!.prompt).toBe("Agent brief");
    expect(validateProject(structuredClone(project))).toEqual(project);
    expect(projectFeedback(done.copy)).toMatchObject({
      baseRevision: project.revision,
      commands: [],
      unmapped: [],
    });
  });

  it("refuses a base from another project, a later one or a nested one", () => {
    const { project } = recordFeedbackBase(agent());
    const base = project.feedbackBase!;
    const bad = [
      { ...base, project: { ...base.project, id: "other" } },
      { ...base, project: { ...base.project, revision: 99 } },
      { ...base, project: { ...base.project, feedbackBase: base } },
      { ...base, extra: true },
    ];
    for (const feedbackBase of bad)
      expect(() =>
        validateProject(structuredClone({ ...project, feedbackBase })),
      ).toThrow();
  });
});

describe("the feedback file", () => {
  it("names the changes, the open notes and the revisions", () => {
    const current = reviewed();
    const feedback = projectFeedback(current);
    expect(feedback).toEqual({
      schema: FEEDBACK_SCHEMA,
      projectId: "signal-studies",
      baseRevision: 2,
      revision: 4,
      commands: [
        {
          command: { op: "move-clip", layerId: "photo-1", startFrame: 72 },
          label: expect.stringContaining("Orbit 1 starts 12 frames"),
        },
        {
          command: {
            op: "add-note",
            noteId: note.id,
            frame: 60,
            text: note.text,
            layerId: "photo-1",
            author: "person",
            createdAt: at,
          },
          label: expect.stringContaining("Earlier, on the kick"),
        },
      ],
      notes: [note],
      unmapped: [],
    });
    // The reader takes back exactly what was written.
    expect(parseFeedback(JSON.parse(JSON.stringify(feedback)))).toEqual(
      feedback,
    );
    // Without a base there are notes and nothing else.
    expect(projectFeedback(person((p) => ({ ...p, notes: [note] })))).toEqual(
      expect.objectContaining({
        baseRevision: null,
        commands: [],
        notes: [note],
      }),
    );
  });

  it("refuses a file with the wrong type, length or count", () => {
    const good = JSON.parse(JSON.stringify(projectFeedback(reviewed())));
    const command = good.commands[0];
    const bad = [
      { ...good, schema: "genobi.director-feedback.v2" },
      { ...good, extra: 1 },
      { ...good, projectId: "Not An Id" },
      { ...good, baseRevision: good.revision + 1 },
      { ...good, baseRevision: null },
      { ...good, commands: Array(2049).fill(command) },
      { ...good, commands: [{ ...command, label: "a\u0007b" }] },
      { ...good, commands: [{ ...command, label: "x".repeat(301) }] },
      { ...good, commands: [{ ...command, command: { op: "delete-layer" } }] },
      { ...good, notes: [{ ...note, resolved: true }] },
      { ...good, notes: [note, note] },
      { ...good, notes: Array(201).fill(note) },
      {
        ...good,
        unmapped: [
          { kind: "layer", id: "x", field: "y", label: "z", reason: "" },
        ],
      },
      {
        ...good,
        unmapped: [
          { kind: "file", id: "x", field: "y", label: "z", reason: "r" },
        ],
      },
    ];
    for (const value of bad) expect(() => parseFeedback(value)).toThrow();
  });

  it("survives Download bundle and Open bundle", async () => {
    const current = reviewed();
    const bundle = { ...base(), project: current.project };
    const zip = bundleZip(bundle);
    const written = JSON.parse(
      new TextDecoder().decode(unzipSync(zip)[FEEDBACK_PATH]),
    );
    expect(written).toEqual(
      JSON.parse(JSON.stringify(projectFeedback({ ...current, prompt: "" }))),
    );
    const reopened = await importBundle(
      new File([new Uint8Array(zip)], "saved.zip"),
    );
    expect(reopened.project.feedbackBase).toEqual(current.project.feedbackBase);
    expect(unzipSync(bundleZip(reopened))[FEEDBACK_PATH]).toEqual(
      unzipSync(zip)[FEEDBACK_PATH],
    );
    // A project with no agent revision writes no feedback file.
    expect(unzipSync(bundleZip(base()))[FEEDBACK_PATH]).toBeUndefined();
  });

  it("opens a full bundle whose save added feedback.json", async () => {
    const current = reviewed();
    const entries = unzipSync(
      bundleZip({ ...base(), project: current.project }),
    );
    expect(entries[FEEDBACK_PATH]).toBeDefined();
    // Pad to the 128 files a project may hold, feedback.json not counted.
    const own = Object.keys(entries).filter((n) => n !== FEEDBACK_PATH).length;
    for (let i = own; i < 128; i++)
      entries[`pad/extra${i}.txt`] = new TextEncoder().encode("x");
    const reopened = await importBundle(
      new File([new Uint8Array(zipSync(entries))], "full.zip"),
    );
    expect(reopened.project.feedbackBase).toEqual(current.project.feedbackBase);
  });
});
