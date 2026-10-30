import { describe, expect, it } from "vitest";
import studio from "../docs/director-bundle/example/studio.json";
import {
  projectFeedback,
  recordFeedbackBase,
} from "../shared/director/feedback";
import {
  cutTo,
  clipPromptInstruction,
  PROMPT_SEND_MAX,
  promptsInstruction,
} from "../shared/director/prompt-send";
import {
  cleanInstruction,
  REGENERATE_INSTRUCTION_MAX,
} from "../shared/director/regenerate";
import type { Layer, Project } from "../shared/director/types";

// What the Editor's Send to Genobi buttons hand the agent: one clip's
// direction from the clip inspector, or the project's from the Global
// prompt, always within the instruction limit and never repeating words the
// person's edits (the feedback commands) already carry.

const fresh = () => structuredClone(studio) as unknown as Project;
const withClip = (p: Project, id: string, patch: Partial<Layer>) => ({
  ...p,
  layers: p.layers.map((l) =>
    l.id === id ? ({ ...l, ...patch } as Layer) : l,
  ),
});
const feedbackOf = (project: Project) =>
  projectFeedback({ project, prompt: "" });
/** The project as the agent last left it (its revision recorded). */
const agentRevision = (project: Project) =>
  recordFeedbackBase({ project, prompt: "" }).project;

describe("the clip inspector's Send", () => {
  it("refuses a clip with no prompt, or one not in the project", () => {
    expect(clipPromptInstruction(fresh(), "labels")).toBe("");
    const directed = withClip(fresh(), "labels", {
      directions: { shot: "wide" },
    });
    expect(clipPromptInstruction(directed, "labels")).toBe("");
    expect(clipPromptInstruction(fresh(), "missing")).toBe("");
  });

  it("names the clip, its place, source and directions, then its words", () => {
    const p = withClip(fresh(), "labels", {
      prompt: "Bars rise on the downbeat.\nHold the last one.",
      directions: { shot: "close-up", lens: "85mm", action: "rise" },
    });
    const text = clipPromptInstruction(p, "labels");
    expect(text).toContain('clip labels "Anime bars", graphics (');
    expect(text).toContain("1.00s–5.00s (frames 30–150 at 30 fps)");
    expect(text).toMatch(/typed directions: shot .*; lens .*; action /);
    expect(text).toMatch(/Its prompt:\nBars rise on the downbeat\.\nHold/);
    expect(text).not.toContain("global prompt");
    const photo = clipPromptInstruction(
      withClip(fresh(), "photo-1", { prompt: "Warmer" }),
      "photo-1",
    );
    expect(photo).toContain("image from asset image-1");
    expect(photo).toContain("It has no typed directions.");
  });

  it("adds the global prompt as shared context", () => {
    const p = {
      ...withClip(fresh(), "labels", { prompt: "Faster" }),
      globalPrompt: "Night, rain, slow dolly.",
    };
    expect(clipPromptInstruction(p, "labels")).toMatch(
      /Faster\n\nThe project's global prompt, shared context for every clip:\nNight, rain, slow dolly\.$/,
    );
  });

  it("stays within the limit: the clip's words first, the global cut", () => {
    const p = {
      ...withClip(fresh(), "labels", {
        name: "n".repeat(120),
        prompt: "clip ".repeat(240),
        directions: { shot: "wide", lens: "14mm", action: "converge" },
      }),
      globalPrompt: "global ".repeat(1700),
    };
    const text = clipPromptInstruction(p, "labels");
    expect(text.length).toBeLessThanOrEqual(PROMPT_SEND_MAX);
    // Regenerate's own cleaning keeps it whole.
    expect(cleanInstruction(text)).toBe(text);
    expect(text).toMatch(/read the rest with genobi_project/);
    expect(text).toMatch(/clip clip/);
  });
});

describe("cutting the person's words", () => {
  const halves = (text: string) =>
    /[\ud800-\udbff](?![\udc00-\udfff])/.test(text);
  it("never leaves half a surrogate pair", () => {
    const pointer = " (cut)";
    // The cut would land between the two halves of the emoji.
    const text = `${"a".repeat(9)}🎬${"b".repeat(20)}`;
    const cut = cutTo(text, 10 + pointer.length, pointer);
    expect(cut).toBe(`${"a".repeat(9)}${pointer}`);
    expect(halves(cut)).toBe(false);
  });

  it("keeps a long clip name whole to its last character", () => {
    const p = withClip(fresh(), "pulse", {
      name: `${"n".repeat(58)}🎬${"m".repeat(20)}`,
      prompt: "Go",
    });
    const text = clipPromptInstruction(p, "pulse");
    expect(halves(text)).toBe(false);
    expect(text).toContain(`clip pulse "${"n".repeat(58)}…"`);
  });
});

describe("the Global prompt's Send", () => {
  it("refuses only when there is no global prompt and no clip prompt", () => {
    const p = fresh();
    expect(promptsInstruction(p, feedbackOf(p))).toEqual({
      text: "",
      clipIds: [],
    });
  });

  it("sends the clip prompts when the global prompt is empty", () => {
    const p = withClip(
      withClip(fresh(), "labels", { prompt: "Bars on the beat" }),
      "photo-1",
      { directions: { lens: "50mm" } },
    );
    const { text, clipIds } = promptsInstruction(p, feedbackOf(p));
    expect(text).toMatch(/^Follow the clip prompts saved in the project;/);
    // By start time: labels (frame 30) before photo-1 (frame 60).
    expect(clipIds).toEqual(["labels", "photo-1"]);
    expect(text).toMatch(/- labels "Anime bars" .*; prompt: Bars on the beat/);
    expect(text).toMatch(/- photo-1 "Orbit 1" .*; directions: lens /);
  });

  it("with no agent revision, sends the global prompt and every clip's words", () => {
    const p = {
      ...withClip(fresh(), "labels", { prompt: "Bars on the beat" }),
      globalPrompt: "Night, rain.",
    };
    const { text, clipIds } = promptsInstruction(p, feedbackOf(p));
    expect(text).toMatch(
      /The global prompt, for the whole piece:\nNight, rain\./,
    );
    expect(text).toContain("prompt: Bars on the beat");
    expect(clipIds).toEqual(["labels"]);
  });

  it("names clips changed since the agent's revision without repeating their words", () => {
    const before = withClip(fresh(), "photo-2", { prompt: "Unchanged" });
    const agent = agentRevision(before);
    const now = {
      ...withClip(agent, "pulse", { prompt: "Rings on the beat" }),
      globalPrompt: "Night, rain.",
    };
    const feedback = feedbackOf(now);
    // The feedback commands already carry the new words, word for word…
    expect(JSON.stringify(feedback.commands)).toContain("Rings on the beat");
    const { text, clipIds } = promptsInstruction(now, feedback);
    // …so the instruction names the clip and leaves the words to them.
    expect(text).toContain("since your revision");
    expect(text).toMatch(/- pulse "p5 rings" 0\.00s/);
    expect(text).not.toContain("Rings on the beat");
    // An unchanged clip the agent already has is not sent again.
    expect(text).not.toContain("Unchanged");
    expect(clipIds).toEqual(["pulse"]);
  });

  it("lists in full a changed clip no feedback command could carry", () => {
    // "labels" is locked: its prompt change is refused against the base.
    const agent = agentRevision(fresh());
    const now = {
      ...withClip(agent, "labels", { prompt: "Bars on the beat" }),
      globalPrompt: "Night.",
    };
    const feedback = feedbackOf(now);
    expect(JSON.stringify(feedback.commands)).not.toContain("Bars on");
    const { text, clipIds } = promptsInstruction(now, feedback);
    expect(text).toContain("prompt: Bars on the beat");
    expect(clipIds).toEqual(["labels"]);
  });

  it("with nothing changed and no global prompt, still sends the clip words", () => {
    const agent = agentRevision(
      withClip(fresh(), "photo-2", { prompt: "Hold" }),
    );
    const { text, clipIds } = promptsInstruction(agent, feedbackOf(agent));
    expect(text).toContain("prompt: Hold");
    expect(clipIds).toEqual(["photo-2"]);
  });

  it("stays within the limit and says how many clips were left out", () => {
    let p: Project = { ...fresh(), globalPrompt: "g ".repeat(3000) };
    for (const l of p.layers)
      p = withClip(p, l.id, { prompt: `${l.id} `.repeat(200) });
    const { text, clipIds } = promptsInstruction(p, feedbackOf(p));
    expect(text.length).toBeLessThanOrEqual(REGENERATE_INSTRUCTION_MAX);
    expect(cleanInstruction(text)).toBe(text);
    expect(clipIds.length).toBeGreaterThan(0);
    expect(clipIds.length).toBeLessThan(p.layers.length);
    expect(text).toMatch(
      new RegExp(
        `… ${p.layers.length - clipIds.length} more; read genobi_project`,
      ),
    );
  });

  it("carries no feedback base, asset files or provider ids", () => {
    const p = {
      ...withClip(fresh(), "plate", { prompt: "Slower" }),
      globalPrompt: "Night.",
    };
    const { text } = promptsInstruction(p, feedbackOf(p));
    expect(text).not.toMatch(/\.mp4|\.png|\.jpg|feedbackBase|jobId|job_/);
  });
});
