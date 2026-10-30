// Regenerate's prompt, from the project state: the person's instruction,
// that this regenerates the linked project, and their edits in the feedback
// export's own form (labelled Director commands, open notes, what no
// command can express) and the timeline order, always inside the session's
// prompt limit.
import { describe, expect, it } from "vitest";
import {
  AGENT_PROMPT_MAX,
  parseAgentSessionRequest,
} from "../shared/agent-session";
import {
  projectFeedback,
  recordFeedbackBase,
} from "../shared/director/feedback";
import {
  cleanInstruction,
  regenerateMessage,
  REGENERATE_INSTRUCTION_MAX,
} from "../shared/director/regenerate";
import type { Note, Project } from "../shared/director/types";
import { agent, layer, person } from "./director-feedback-fixture";

/** The agent's revision, then the person's edit in the Editor. */
function edited(change: (p: Project) => Project) {
  const base = recordFeedbackBase(agent());
  const now = person((p) => change(p));
  const project = { ...now.project, feedbackBase: base.project.feedbackBase };
  return { project, feedback: projectFeedback({ ...now, project }) };
}
const note = (id: string, frame: number, text: string): Note => ({
  id,
  frame,
  text,
  author: "person",
  createdAt: "2026-10-27T10:00:00.000Z",
});

describe("regenerateMessage", () => {
  it("carries the instruction, the regenerate and the person's edits", () => {
    const { project, feedback } = edited((p) => ({
      ...layer(p, "photo-1", { startFrame: 72 }),
      notes: [note("n1", 48, "Hold this title a beat longer")],
    }));
    const text = regenerateMessage({
      instruction: "Fix the second shot.\nUse my new order.",
      project,
      feedback,
    });
    expect(text).toContain(
      `Regenerate the linked Director project "Signal studies / 01" (id signal-studies, revision ${project.revision})`,
    );
    // The person's words, verbatim between fences.
    expect(text).toContain(
      "between the --- lines:\n---\nFix the second shot.\nUse my new order.\n---\n",
    );
    expect(text).toContain("genobi_project_feedback");
    // The feedback export's labelled command, as JSON the agent can apply.
    expect(text).toContain(
      `1. ${feedback.commands[0].label} {"op":"move-clip","layerId":"photo-1","startFrame":72}`,
    );
    expect(text).toContain(
      "between the --- lines (resolve each once it is done):\n---\n- n1 at frame 48: Hold this title a beat longer\n---",
    );
    // The timeline order, bottom track first, with the moved clip's frames.
    expect(text).toContain('photo-1 "Orbit 1" image (asset image-1)');
    expect(text).toContain("frames 72–102");
    expect(text.indexOf("score")).toBeLessThan(text.indexOf("crt-pass"));
    expect(text).toMatch(/Quote every paid step .* never resubmit/);
    expect(text).not.toContain("next turn");
    // The session's own parser takes it as it is.
    expect(
      parseAgentSessionRequest({ prompt: text, source: "typed" }).prompt,
    ).toBe(text);
  });

  it("says when no agent revision is recorded, and lists the timeline", () => {
    const project = agent().project;
    const text = regenerateMessage({
      instruction: "Make it punchier",
      project,
      feedback: projectFeedback(agent()),
    });
    expect(text).toContain("No agent revision is recorded on this project");
    expect(text).toContain("The timeline now, bottom track first");
    expect(text).not.toContain("Director commands in order");
  });

  it("names the previous session when this is its next turn", () => {
    const text = regenerateMessage({
      instruction: "Again, slower",
      project: agent().project,
      feedback: projectFeedback(agent()),
      previous: { status: "done", summary: "Cut four shots to the grid." },
    });
    expect(text).toContain(
      "This is the next turn on this project: the previous session ended done. Its summary: Cut four shots to the grid.",
    );
  });

  it("stays inside the prompt limit, pointing at the full feedback", () => {
    const notes = Array.from({ length: 200 }, (_, i) =>
      note(`n${i}`, i % 180, `Note ${i} `.repeat(30)),
    );
    const { project, feedback } = edited((p) => ({ ...p, notes }));
    const text = regenerateMessage({
      instruction: "x".repeat(REGENERATE_INSTRUCTION_MAX + 500),
      project,
      feedback,
      previous: { status: "waiting", summary: "y".repeat(2000) },
    });
    expect(text.length).toBeLessThanOrEqual(AGENT_PROMPT_MAX);
    // The notes' fence closes even when the list is cut.
    expect(text).toMatch(
      /… \d+ more notes; read genobi_project_feedback for the full list\.\n---/,
    );
    expect(text).toContain("x".repeat(REGENERATE_INSTRUCTION_MAX));
    expect(text).not.toContain("x".repeat(REGENERATE_INSTRUCTION_MAX + 1));
    expect(text.endsWith("what the person has to do next.")).toBe(true);
  });

  it("strips control characters and refuses an empty instruction", () => {
    expect(cleanInstruction("a\x00b\r\nc\x1b\n\n\n\nd")).toBe("a b\nc \n\nd");
    // A line of dashes cannot close the fence early.
    expect(cleanInstruction("one\n---\ntwo\n ----- ")).toBe(
      "one\n(---)\ntwo\n(-----)",
    );
    expect(() =>
      regenerateMessage({
        instruction: " \x00\n ",
        project: agent().project,
        feedback: projectFeedback(agent()),
      }),
    ).toThrow("Say what should change.");
  });
});
