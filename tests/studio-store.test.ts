import { afterEach, describe, it, expect, vi } from "vitest";
import { createStudioStore } from "../src/studio/store";
import { executeStudioCommand } from "../src/studio/commands";
import { assetFixture, imageFile } from "./director-asset-fixture";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  return store;
}
describe("one studio document owner", () => {
  it("mode and drawer changes retain document identity, settings and edits", async () => {
    const store = fixture(),
      actions = store.getState().actions;
    await executeStudioCommand(
      { op: "text", revision: 1, layerId: "title", text: "SHARED" },
      undefined,
      store,
    );
    const b = store.getState().director.bundle;
    actions.settings({ zoom: 150, looping: true });
    actions.workspace({
      advanced: true,
      drawerOpen: true,
      assetRole: "reference",
    });
    actions.workspace({ advanced: false });
    expect(store.getState().director.bundle).toBe(b);
    expect(store.getState().workspace.drawerOpen).toBe(true);
    expect(store.getState().settings.zoom).toBe(150);
    actions.initialize(assetFixture());
    expect(store.getState().director.bundle).toBe(b);
  });
  it("undo increases revision and stale agent writes fail", async () => {
    const store = fixture();
    await executeStudioCommand(
      { op: "text", revision: 1, layerId: "title", text: "NEW" },
      undefined,
      store,
    );
    store.getState().actions.undo();
    expect(store.getState().director.bundle?.project.revision).toBe(3);
    await expect(
      executeStudioCommand(
        { op: "text", revision: 1, layerId: "title", text: "STALE" },
        undefined,
        store,
      ),
    ).rejects.toThrow("changed");
    expect(store.getState().operations.workingFile).toBe(false);
  });
  it("keeps draft histories per project rather than undoing a template switch", async () => {
    const store = fixture(),
      actions = store.getState().actions;
    await executeStudioCommand(
      { op: "text", revision: 1, layerId: "title", text: "DRAFT" },
      undefined,
      store,
    );
    const other = assetFixture();
    other.project.id = "other";
    actions.commit(other, store.getState().director.bundle);
    expect(store.getState().director.history).toHaveLength(0);
    const saved = store.getState().director.drafts["signal-studies"].bundle;
    actions.commit(saved, store.getState().director.bundle);
    expect(store.getState().director.history).toHaveLength(1);
    expect(
      store
        .getState()
        .director.bundle?.project.layers.find((l) => l.id === "title"),
    ).toMatchObject({ parameters: { text: "DRAFT" } });
  });
  it("reserves async writes and rejects a late import after document replacement", async () => {
    const store = fixture();
    let release!: (value: unknown) => void;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(
        () =>
          new Promise((r) => {
            release = r;
          }),
      ),
    );
    const pending = executeStudioCommand(
      { op: "import-asset", revision: 1, use: "reference" },
      imageFile(),
      store,
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(
      executeStudioCommand(
        { op: "text", revision: 1, layerId: "title", text: "RACE" },
        undefined,
        store,
      ),
    ).rejects.toThrow("Wait");
    const before = store.getState().director.bundle!;
    store
      .getState()
      .actions.commit(
        { ...before, project: { ...before.project, name: "newer" } },
        before,
      );
    release({ width: 100, height: 100, close() {} });
    await expect(pending).rejects.toThrow("changed");
    expect(store.getState().director.bundle?.project.name).toBe("newer");
    expect(
      Object.keys(store.getState().director.bundle!.project.assets),
    ).toHaveLength(Object.keys(before.project.assets).length);
    expect(store.getState().operations.workingFile).toBe(false);
  });
});
