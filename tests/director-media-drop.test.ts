import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() =>
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1200, height: 1600, close: vi.fn() }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
import { assetFixture, imageFile } from "./director-asset-fixture";
import { createStudioStore } from "../src/studio/store";
import { executeStudioCommand } from "../src/studio/commands";
import {
  PROJECT_ASSET_DRAG,
  readAssetDrag,
  writeAssetDrag,
} from "../src/director/asset-drag";
import { importProjectMedia } from "../src/director/import-project-media";

function transfer() {
  const data = new Map<string, string>();
  return {
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value),
    effectAllowed: "none",
  } as unknown as DataTransfer;
}
function fixture() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  return store;
}

describe("project asset drops", () => {
  it("keeps references as inspirations when using a production copy", async () => {
    const store = fixture();
    await importProjectMedia([imageFile()], "reference", store);
    const before = store.getState().director.bundle!;
    const [assetId, asset] = Object.entries(before.project.assets).find(
      ([, a]) => a.use === "reference",
    )!;
    const drag = transfer();
    writeAssetDrag(drag, before, assetId);
    expect(drag.effectAllowed).toBe("copy");
    expect(drag.getData(PROJECT_ASSET_DRAG)).not.toContain(asset.file.path);
    const dropped = readAssetDrag(drag, before);
    const target = before.project.layers.find((l) => l.kind === "image")!;
    await executeStudioCommand(
      {
        op: "use-asset",
        revision: before.project.revision,
        assetId: dropped.assetId,
        layerIds: [target.id],
      },
      undefined,
      store,
    );
    const after = store.getState().director.bundle!;
    expect(after.project.assets[assetId].use).toBe("reference");
    const layer = after.project.layers.find((l) => l.id === target.id)!;
    expect(
      "assetId" in layer && after.project.assets[layer.assetId],
    ).toMatchObject({ use: "production", file: asset.file });
    store.getState().actions.undo();
    expect(store.getState().director.bundle!.project.assets[assetId].use).toBe(
      "reference",
    );
  });
  it("rejects a drag from another project or a replaced asset", () => {
    const bundle = assetFixture(),
      drag = transfer();
    const id = Object.keys(bundle.project.assets)[0];
    writeAssetDrag(drag, bundle, id);
    const other = structuredClone(bundle);
    other.project.id = "different-project";
    expect(() => readAssetDrag(drag, other)).toThrow("current project");
    bundle.project.assets[id].file.sha256 = "f".repeat(64);
    expect(() => readAssetDrag(drag, bundle)).toThrow("changed");
  });
  it("refuses malformed, missing and oversized drag payloads", () => {
    const bundle = assetFixture(),
      drag = transfer();
    for (const data of [
      "",
      "null",
      "{",
      "x".repeat(513),
      JSON.stringify({
        projectId: bundle.project.id,
        assetId: "__proto__",
        sha256: "a".repeat(64),
      }),
    ]) {
      drag.setData(PROJECT_ASSET_DRAG, data);
      expect(() => readAssetDrag(drag, bundle)).toThrow();
    }
  });
});
describe("shelf imports", () => {
  it("imports into the chosen role without changing composition layers", async () => {
    const store = fixture();
    const layers = structuredClone(
      store.getState().director.bundle!.project.layers,
    );
    const count = Object.values(
      store.getState().director.bundle!.project.assets,
    ).filter((asset) => asset.use === "reference").length;
    await importProjectMedia([imageFile(), imageFile()], "reference", store);
    const result = store.getState().director.bundle!;
    expect(result.project.layers).toEqual(layers);
    expect(
      Object.values(result.project.assets).filter((a) => a.use === "reference"),
    ).toHaveLength(count + 1);
  });
  it("stops a batch if a synchronous listener switches projects after the first import", async () => {
    const store = fixture(),
      original = store.getState().director.bundle!;
    const next = assetFixture();
    next.project.id = "another-project";
    const originalAssets = structuredClone(next.project.assets);
    let switched = false;
    const unsubscribe = store.subscribe((state) => {
      if (!switched && state.director.bundle !== original) {
        switched = true;
        state.actions.commit(next, state.director.bundle);
      }
    });
    await expect(
      importProjectMedia([imageFile(), imageFile()], "reference", store),
    ).rejects.toThrow("Project changed");
    unsubscribe();
    expect(store.getState().director.bundle!.project.id).toBe(next.project.id);
    expect(store.getState().director.bundle!.project.assets).toEqual(
      originalAssets,
    );
  });
});
