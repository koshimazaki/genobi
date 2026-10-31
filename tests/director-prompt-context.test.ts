import { describe, expect, it } from "vitest";
import {
  DIRECTION_CONTEXT_PROMPT_MAX,
  parseDirection,
  projectDirection,
} from "../shared/agent-context-direction";
import { contextBlock, parseAgentContext } from "../shared/agent-context";
import { applyCommand } from "../shared/director/commands";
import { diffCopies } from "../shared/director/feedback";
import type { Layer, Project } from "../shared/director/types";
import { projectSummary } from "../mcp/director-tools";
import { scopedContext } from "../server/agent-scope";
import { createStudioStore } from "../src/studio/store";
import { agent, ops, person, roundTrip } from "./director-feedback-fixture";
import { base } from "./house-template-fixtures";

// What agents read of the prompt contract: the session's studio context
// (global prompt, selected clip), genobi_project, and the feedback diff.
const camera = { "shot-sizes": null, angles: "low-angle", movements: "orbit" };
function directed(): Project {
  const p = base().project;
  return {
    ...p,
    globalPrompt: "Monumental stone, cold mist.\nBuild to one impact.",
    layers: p.layers.map((l) =>
      l.id === "plate"
        ? ({
            ...l,
            prompt: "Reveal the gate from below.",
            directions: { shot: "wide", lens: "24mm", camera, action: "rise" },
          } as Layer)
        : l,
    ),
  };
}

describe("the direction in a session's studio context", () => {
  it("carries the global prompt and the selected clip's own fields", () => {
    const direction = projectDirection(directed(), "plate")!;
    expect(direction).toEqual({
      projectId: directed().id,
      globalPrompt: directed().globalPrompt,
      clip: {
        layerId: "plate",
        name: "Orbit / video plate",
        kind: "video",
        prompt: "Reveal the gate from below.",
        directions: { shot: "wide", lens: "24mm", camera, action: "rise" },
      },
    });
    const context = parseAgentContext({ picks: [], direction });
    expect(context.direction).toEqual(direction);
    const block = contextBlock(context);
    expect(block).toContain("`direction`");
    expect(block).toContain("outranks saved directions");
    expect(block).toContain("Reveal the gate from below.");
    // Nothing to tell: no global prompt and no selection.
    expect(projectDirection(base().project, "")).toBeUndefined();
    // A selection without a prompt still names the clip.
    expect(projectDirection(base().project, "title")?.clip).toEqual({
      layerId: "title",
      name: base().project.layers.find((l) => l.id === "title")!.name,
      kind: "graphics",
    });
  });

  it("cuts a long global prompt and says so", () => {
    const long = { ...directed(), globalPrompt: "a".repeat(9000) };
    const direction = projectDirection(long, undefined)!;
    expect(direction.globalPrompt).toHaveLength(DIRECTION_CONTEXT_PROMPT_MAX);
    expect(direction.globalPromptCut).toBe(true);
    expect(parseDirection(direction)).toEqual(direction);
  });

  it("refuses what the project would not hold", () => {
    const good = projectDirection(directed(), "plate")!;
    const bad: unknown[] = [
      { ...good, projectId: "Bad Id" },
      { ...good, extra: 1 },
      { ...good, globalPrompt: "a".repeat(DIRECTION_CONTEXT_PROMPT_MAX + 1) },
      { ...good, clip: { ...good.clip, kind: "mesh" } },
      { ...good, clip: { ...good.clip, layerId: "Plate!" } },
      { ...good, clip: { ...good.clip, prompt: "x".repeat(1201) } },
      { ...good, clip: { ...good.clip, directions: { lens: "16mm" } } },
      { ...good, clip: { ...good.clip, directions: { lens: null } } },
      { ...good, clip: { ...good.clip, path: "/Users/me" } },
    ];
    for (const value of bad)
      expect(() => parseDirection(value), JSON.stringify(value)).toThrow(
        /studio context/,
      );
    // Control characters other than line breaks become spaces.
    expect(
      parseDirection({ projectId: "p", globalPrompt: "a\x07b\nc" })
        .globalPrompt,
    ).toBe("a b\nc");
  });

  it("is kept for the linked project only", () => {
    const direction = projectDirection(directed(), "plate")!;
    const context = { picks: [], direction };
    const owns = () => true;
    expect(
      scopedContext(context, "me", owns, undefined, directed().id).context
        ?.direction,
    ).toEqual(direction);
    expect(
      scopedContext(context, "me", owns, undefined, "other").context,
    ).not.toHaveProperty("direction");
    expect(
      scopedContext(context, "me", owns, undefined).context,
    ).not.toHaveProperty("direction");
  });
});

describe("genobi_project", () => {
  it("returns the global prompt beside the brief, and each clip's own fields", () => {
    const summary = projectSummary({
      copyId: "signal-studies.abcdefghjk",
      id: directed().id,
      revision: 1,
      updatedAt: "2026-10-29T00:00:00.000Z",
      project: directed(),
      brief: { version: 1, text: "Earlier brief", references: [] },
    });
    expect(summary.globalPrompt).toBe(directed().globalPrompt);
    expect(summary.prompt).toBe("Earlier brief");
    const clips = summary.tracks.flatMap((t) => t.clips);
    expect(clips.find((c) => c.layerId === "plate")).toMatchObject({
      prompt: "Reveal the gate from below.",
      directions: { shot: "wide", lens: "24mm", camera, action: "rise" },
      directionWords:
        "shot Wide; lens 24mm (feel); camera Low angle, Orbit; action Rise / ascend",
    });
    const title = clips.find((c) => c.layerId === "title")!;
    expect(title).not.toHaveProperty("prompt");
    expect(title).not.toHaveProperty("directions");
  });
});

describe("feedback on prompts", () => {
  it("lists the person's prompt and direction edits as commands", () => {
    const diff = roundTrip(
      person((p) => {
        const d = directed();
        return {
          ...p,
          globalPrompt: d.globalPrompt,
          layers: p.layers.map((l) =>
            l.id === "plate"
              ? ({
                  ...l,
                  prompt: "Mine",
                  directions: { lens: "85mm" },
                } as Layer)
              : l,
          ),
        };
      }),
    );
    expect(ops(diff.commands)).toEqual([
      "set-global-prompt",
      "set-clip-prompt",
      "set-clip-directions",
    ]);
    expect(diff.commands[2].label).toMatch(/lens "85mm"/);
  });

  it("clears what the person removed, and reports a locked clip", () => {
    const from = { ...agent(), project: directed() };
    const diff = roundTrip(
      {
        ...from,
        project: {
          ...base().project,
          revision: 2,
        },
      },
      from,
    );
    expect(ops(diff.commands)).toEqual([
      "set-global-prompt",
      "set-clip-prompt",
      "set-clip-directions",
    ]);
    const locked = person((p) => ({
      ...p,
      layers: p.layers.map((l) =>
        l.id === "labels" ? ({ ...l, prompt: "Locked words" } as Layer) : l,
      ),
    }));
    expect(diffCopies(agent(), locked).unmapped).toEqual([
      expect.objectContaining({ id: "labels", field: "prompt" }),
    ]);
  });
});

describe("the studio's undo", () => {
  it("takes back a prompt command in one step", () => {
    const store = createStudioStore();
    const { actions } = store.getState();
    actions.initialize(base());
    const before = store.getState().director.bundle!;
    const result = applyCommand(
      { project: before.project, prompt: "" },
      { op: "set-clip-prompt", layerId: "plate", text: "Hold longer" },
    );
    if (!result.ok) throw new Error(result.error);
    actions.commit({ ...before, project: result.copy.project });
    const edited = store.getState().director.bundle!.project;
    expect(edited.layers.find((l) => l.id === "plate")?.prompt).toBe(
      "Hold longer",
    );
    actions.undo();
    const undone = store.getState().director.bundle!.project;
    expect(undone.layers.find((l) => l.id === "plate")).not.toHaveProperty(
      "prompt",
    );
    expect(undone.revision).toBeGreaterThan(edited.revision);
  });
});
