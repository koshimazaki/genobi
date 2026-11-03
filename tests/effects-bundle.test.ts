import { describe, expect, it } from "vitest";
import { createStudioStore } from "../src/studio/store";
import { executeStudioCommand } from "../src/studio/commands";
import { digest, validateFiles } from "../src/director/bundle";
import { applyEffectToBundle } from "../src/director/effect-bundle";
import { assetFixture } from "./director-asset-fixture";

const command = {
  op: "apply-effect-preset",
  presetId: "kinetic-title",
  instanceId: "test-title",
  expectedRevision: 1,
  startFrame: 0,
  durationFrames: 60,
  parameters: { text: "EDIT ME" },
};

describe("preset insertion through the studio document owner", () => {
  it("attaches verified source bytes, commits once and undoes every inserted layer", async () => {
    const store = createStudioStore();
    const before = assetFixture();
    store.getState().actions.initialize(before);
    const result = await executeStudioCommand(command, undefined, store);
    expect(result.receipt).toMatchObject({
      layerIds: ["test-title-title"],
      revision: 2,
    });
    const next = store.getState().director.bundle!;
    const module = next.project.modules["effects-kinetic-title"];
    expect(await digest(next.files.get(module.file.path)!)).toBe(
      module.file.sha256,
    );
    await validateFiles(next);
    expect(store.getState().director.history).toHaveLength(1);
    await expect(
      executeStudioCommand(command, undefined, store),
    ).rejects.toThrow(/Project changed/);
    expect(store.getState().director.history).toHaveLength(1);
    store.getState().actions.undo();
    expect(store.getState().director.bundle!.project.layers).toEqual(
      before.project.layers,
    );
    expect(store.getState().director.bundle!.project.revision).toBe(3);
  });
  it("refuses an untrusted extra ZIP file at the future module path", async () => {
    const bundle = assetFixture();
    bundle.files.set(
      "graphics/effects-kinetic-title.mjs",
      new TextEncoder().encode("malicious extra"),
    );
    const { op: _op, ...input } = command;
    await expect(applyEffectToBundle(bundle, input)).rejects.toThrow(
      /Another file occupies/,
    );
    expect(bundle.project.revision).toBe(1);
  });
});
