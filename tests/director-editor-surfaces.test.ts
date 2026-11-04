import { describe, expect, it } from "vitest";
import { applyCommand } from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import { runDirectorCommand } from "../src/director/remix-commands";
import { executeStudioCommand } from "../src/studio/commands";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";
import { linkedStudio } from "./mcp-director-harness";

const COMMANDS = [
  { op: "set-fps", fps: 24 },
  { op: "set-duration", durationFrames: 240 },
  { op: "rename-project", name: "Signal studies / 02" },
  { op: "rename-layer", layerId: "plate", name: "Orbit plate" },
  { op: "reorder-layer", layerId: "pulse", by: 1 },
];

describe("Editor commands on every surface", () => {
  it("runs over MCP and HTTP once per revision, refusing stale and locked writes", async () => {
    const { owner, call, client } = await linkedStudio();
    const { code } = await owner("/link", "POST");
    const { copyId } = await call("genobi_link_project", {
      code: String(code),
    });
    let expected = base().project;
    for (const [index, command] of COMMANDS.entries()) {
      const args = { copyId, baseRevision: index + 1, command };
      expect(await call("genobi_director_command", args)).toMatchObject({
        revision: index + 2,
      });
      // The same command again is a stale write, not a second edit.
      expect(await call("genobi_director_command", args)).toEqual({
        error: expect.stringContaining("revision_conflict"),
      });
      const result = applyCommand({ project: expected, prompt: "" }, command);
      if (!result.ok) throw new Error(result.error);
      expected = result.copy.project;
    }
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 6,
        command: { op: "rename-layer", layerId: "labels", name: "Bars" },
      }),
    ).toEqual({ error: expect.stringContaining("Unlock") });
    const stored = await owner("", "GET");
    expect(stored.revision).toBe(6);
    const project = stored.project as Project;
    expect(project.name).toBe("Signal studies / 02");
    expect(project.composition).toMatchObject({
      fps: 24,
      durationFrames: 240,
    });
    expect(project.layers).toEqual(expected.layers);
    // Feedback starts from the agent's last command: nothing is outstanding.
    const feedback = await call("genobi_project_feedback", { copyId });
    expect(feedback).toMatchObject({ commands: [], unmapped: [] });
    await client.close();
  });

  it("runs from the browser console with the same result and revision guard", async () => {
    for (const command of COMMANDS) {
      const bundle = base();
      const result = await runDirectorCommand(bundle, {
        ...command,
        revision: 1,
      });
      if (!("bundle" in result) || !result.bundle)
        throw new Error("missing bundle");
      const shared = applyCommand(
        { project: bundle.project, prompt: "" },
        command,
      );
      if (!shared.ok) throw new Error(shared.error);
      expect(result.bundle.project).toEqual(shared.copy.project);
      expect(result.bundle.project.revision).toBe(2);
      await expect(
        runDirectorCommand(result.bundle, { ...command, revision: 1 }),
      ).rejects.toThrow(/changed/);
    }
  });

  it("keeps a rate change one Undo step in the Studio store", async () => {
    const store = createStudioStore();
    const bundle = base();
    store.getState().actions.initialize(bundle);
    await executeStudioCommand(
      { op: "set-fps", revision: 1, fps: 25 },
      undefined,
      store,
    );
    expect(store.getState().director.bundle?.project.composition.fps).toBe(25);
    store.getState().actions.undo();
    // Undo restores the earlier project as a newer revision.
    const { revision: _restored, ...undone } =
      store.getState().director.bundle!.project;
    const { revision: _original, ...original } = bundle.project;
    expect(undone).toEqual(original);
  });
});
