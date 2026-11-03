import { describe, expect, it } from "vitest";
import { effectInsertionCommand } from "../src/effects/insertion-command";
import { executeStudioCommand } from "../src/studio/commands";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";

const values = {
  presetId: "kinetic-title",
  instanceId: "ui-title",
  frame: 15,
  seconds: 2,
  parameters: { text: "MY TITLE" },
  selectedId: "plate",
};

describe("catalogue Insert action", () => {
  it("inserts a source-free title even when a video is selected", async () => {
    const store = createStudioStore();
    const before = assetFixture();
    store.getState().actions.initialize(before);
    const command = effectInsertionCommand(before.project, values);
    expect(command.sourceLayerId).toBeUndefined();
    await executeStudioCommand(command, undefined, store);
    expect(
      store.getState().director.bundle!.project.layers.at(-1),
    ).toMatchObject({
      kind: "graphics",
      startFrame: 15,
      durationFrames: 60,
      parameters: { text: "MY TITLE" },
    });
  });

  it("inserts a scan and HUD atomically using the current source, then undoes both", async () => {
    const store = createStudioStore();
    const before = assetFixture();
    store.getState().actions.initialize(before);
    const command = effectInsertionCommand(before.project, {
      ...values,
      presetId: "cinematic-scan",
      parameters: { label: "CURRENT SOURCE" },
    });
    expect(command.sourceLayerId).toBe("plate");
    await executeStudioCommand(command, undefined, store);
    const after = store.getState().director;
    expect(
      after.bundle!.project.layers.slice(-2).map((layer) => layer.kind),
    ).toEqual(["filter", "graphics"]);
    expect(after.history).toHaveLength(1);
    expect(after.bundle!.project.assets).toEqual(before.project.assets);
    store.getState().actions.undo();
    expect(store.getState().director.bundle!.project.layers).toEqual(
      before.project.layers,
    );
  });

  it("keeps the edit untouched if the selected source is too short", async () => {
    const store = createStudioStore();
    const before = assetFixture();
    store.getState().actions.initialize(before);
    const command = effectInsertionCommand(before.project, {
      ...values,
      presetId: "poster-window",
      selectedId: "photo-1",
      frame: 70,
      parameters: { mix: 0.4 },
    });
    expect(command.sourceLayerId).toBe("photo-1");
    await expect(
      executeStudioCommand(command, undefined, store),
    ).rejects.toThrow(/full duration/);
    expect(store.getState().director.bundle).toBe(before);
    expect(store.getState().director.history).toHaveLength(0);
    expect(Object.values(store.getState().operations).some(Boolean)).toBe(
      false,
    );
  });

  it("fits the composition at its last frame and uses its current revision", () => {
    const project = assetFixture().project;
    project.revision = 8;
    const command = effectInsertionCommand(project, {
      ...values,
      frame: project.composition.durationFrames,
    });
    expect(command).toMatchObject({
      expectedRevision: 8,
      startFrame: project.composition.durationFrames - 1,
      durationFrames: 1,
    });
  });
});
