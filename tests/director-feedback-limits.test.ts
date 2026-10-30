import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_BASE_BYTES,
  jsonBytes,
  projectFeedback,
  recordFeedbackBase,
} from "../shared/director/feedback";
import type { Layer, Project } from "../shared/director/types";
import { bundleZip, importBundle } from "../src/director/bundle";
import { feedbackOf } from "../src/director/feedback-file";
import { manifestText, MANIFEST_BYTES } from "../src/director/manifest";
import { applyEvent } from "../src/director/project-copy";
import { validateProject } from "../src/director/validate";
import { createStudioStore } from "../src/studio/store";
import { agent, layer } from "./director-feedback-fixture";
import { base } from "./house-template-fixtures";

// The agent's revision is untrusted input, survives Undo, and never makes a
// project too large to reopen.

/** A title text pattern that backtracks for ever on "aaa…a!". */
const EVIL = "^(a+)+$";
const words = `${"a".repeat(40)}!`;
function poisoned(): Project {
  const { project } = recordFeedbackBase(agent());
  const snapshot = structuredClone(project.feedbackBase!.project);
  const title = snapshot.modules.title.parameterSchema.properties!.text;
  Object.assign(title, { pattern: EVIL });
  return {
    ...layer(project, "title", {
      parameters: { text: words, color: "#e4e8ed", size: 42, bpm: 120 },
    }),
    revision: project.revision + 1,
    feedbackBase: { project: snapshot, prompt: "Agent brief" },
  };
}
const quick = <T>(run: () => T) => {
  const started = performance.now();
  const result = run();
  expect(performance.now() - started).toBeLessThan(500);
  return result;
};

describe("the agent's revision is untrusted", () => {
  it("is refused with a recipe schema the registry does not hold", () => {
    expect(() => quick(() => validateProject(poisoned()))).toThrow(
      "The agent's revision: Recipe parameter schema changed: title",
    );
  });

  it("never runs a pattern the base brought, even unvalidated", () => {
    const feedback = quick(() =>
      projectFeedback({ project: poisoned(), prompt: "Agent brief" }),
    );
    expect(feedback.commands).toEqual([
      expect.objectContaining({
        command: {
          op: "set-parameters",
          layerId: "title",
          parameters: { text: words },
        },
      }),
    ]);
  });
});

describe("Undo after an agent's edit", () => {
  it("keeps the agent's revision, so the undone edit reads as feedback", () => {
    const store = createStudioStore();
    const { actions } = store.getState();
    actions.initialize(base());
    const before = store.getState().director.bundle!;
    const revision = before.project.revision;
    const next = applyEvent(before, {
      projectId: before.project.id,
      revision: revision + 1,
      baseRevision: revision,
      source: "command",
      command: { op: "move-clip", layerId: "photo-1", startFrame: 72 },
    })!;
    actions.commit(next);
    actions.undo();
    const undone = store.getState().director.bundle!;
    expect(undone.project.feedbackBase?.project.revision).toBe(revision + 1);
    expect(feedbackOf(undone)).toMatchObject({
      baseRevision: revision + 1,
      commands: [
        {
          command: { op: "move-clip", layerId: "photo-1", startFrame: 60 },
        },
      ],
    });
  });
});

describe("a project with its agent's revision reopens", () => {
  /** The example padded with a plan prompt to `bytes` of compact JSON. */
  function sized(bytes: number): Project {
    const p = structuredClone(base().project);
    p.generationPlans.push({
      id: "plan-pad",
      status: "not-run",
      replaceAssetId: "video",
      referenceAssetIds: [],
      prompt: "x",
    });
    const pad = bytes - jsonBytes(p);
    p.generationPlans.at(-1)!.prompt = "x".repeat(pad + 1);
    expect(jsonBytes(p)).toBe(bytes);
    return p;
  }
  const reopen = async (project: Project) => {
    const zip = bundleZip({ ...base(), project });
    return importBundle(new File([new Uint8Array(zip)], "saved.zip"));
  };

  it("at the reviewer's 558 KB and at the 1 MB edge, as a ZIP and as JSON", async () => {
    for (const bytes of [557_802, MANIFEST_BYTES - 2048]) {
      const { project } = recordFeedbackBase({
        project: sized(bytes),
        prompt: "",
      });
      expect(project.feedbackBase).toBeDefined();
      expect(manifestText(project).length).toBeGreaterThan(MANIFEST_BYTES);
      expect((await reopen(project)).project).toEqual(project);
      const json = await importBundle(
        new File([manifestText(project)], "project.json"),
        base(),
      );
      expect(json.project).toEqual(project);
    }
  });

  it("drops a base too large to keep, and refuses one written in anyway", async () => {
    const big = sized(FEEDBACK_BASE_BYTES + 10);
    expect(recordFeedbackBase({ project: big, prompt: "" }).project).toEqual(
      big,
    );
    const small = recordFeedbackBase(agent()).project;
    const forced = {
      ...small,
      feedbackBase: { project: { ...big, revision: 1 }, prompt: "" },
    };
    await expect(reopen(forced)).rejects.toThrow("over 1 MB");
    // Past the manifest's own limit is refused, as before.
    await expect(reopen(sized(MANIFEST_BYTES + 10))).rejects.toThrow(
      "Manifest limit is 1 MB",
    );
    expect(
      unzipSync(bundleZip({ ...base(), project: small }))["project.json"]
        .length,
    ).toBeGreaterThan(0);
  });

  it("is not taken from a bundle that is merely opened", async () => {
    const opened = await reopen(base().project);
    expect(opened.project.feedbackBase).toBeUndefined();
    const layers: Layer[] = opened.project.layers;
    expect(layers.length).toBeGreaterThan(0);
  });
});
