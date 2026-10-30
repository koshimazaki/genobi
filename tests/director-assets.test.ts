import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { assetFixture, imageFile } from "./director-asset-fixture";
import {
  runDirectorCommand,
  parseCommand,
} from "../src/director/remix-commands";
import { importAssets } from "../src/director/import-media";
import { importBundle, validateFiles } from "../src/director/bundle";
import { placeAsset, assetUses } from "../shared/director/assets";
import { validateProject } from "../src/director/validate";
afterEach(() => vi.unstubAllGlobals());
function decoder() {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1200, height: 1600, close: vi.fn() }),
  );
}

describe("project assets without placement", () => {
  it("imports references, deduplicates bytes across roles, and reopens them in ZIP", async () => {
    decoder();
    const before = assetFixture();
    const imported = await importAssets(before, [imageFile()], "reference");
    expect(imported.bundle.project.layers).toEqual(before.project.layers);
    expect(before.project.assets).not.toHaveProperty(imported.assetIds[0]);
    const duplicate = await importAssets(
      imported.bundle,
      [imageFile()],
      "reference",
    );
    expect(duplicate.assetIds).toEqual(imported.assetIds);
    const production = await importAssets(
      duplicate.bundle,
      [imageFile()],
      "production",
    );
    expect(production.assetIds[0]).not.toBe(imported.assetIds[0]);
    expect(production.bundle.files.size).toBe(imported.bundle.files.size);
    const bytes = zipSync({
      ...Object.fromEntries(production.bundle.files),
      "project.json": strToU8(JSON.stringify(production.bundle.project)),
    });
    const reopened = await importBundle(
      new File([new Uint8Array(bytes)], "saved.zip"),
    );
    expect(reopened.project).toEqual(production.bundle.project);
    await validateFiles(reopened);
  });
  it("explicit reference placement creates a production alias and preserves timing/text", async () => {
    decoder();
    const {
      bundle,
      assetIds: [id],
    } = await importAssets(assetFixture(), [imageFile()], "reference");
    const p = placeAsset(bundle.project, id, ["plate"], "alias");
    validateProject(p);
    expect(p.assets[id].use).toBe("reference");
    expect(p.assets.alias.use).toBe("production");
    expect(p.assets.alias.file).toEqual(p.assets[id].file);
    expect(p.layers.filter((l) => l.id !== "plate")).toEqual(
      bundle.project.layers.filter((l) => l.id !== "plate"),
    );
    const layer = p.layers.find((l) => l.id === "plate")!;
    expect(layer.durationFrames).toBe(180);
    expect(layer.kind).toBe("image");
    expect(layer).not.toHaveProperty("sourceStartFrame");
  });
  it("rejects locked, incompatible and short sources atomically", () => {
    const b = assetFixture();
    b.project.layers.find((l) => l.id === "plate")!.locked = true;
    expect(() => placeAsset(b.project, "video", ["plate"], "a")).toThrow(
      "unlocked",
    );
    b.project.layers.find((l) => l.id === "plate")!.locked = false;
    b.project.assets.video.durationSeconds = 0.2;
    expect(() => placeAsset(b.project, "video", ["plate"], "a")).toThrow(
      "short",
    );
    expect(() =>
      placeAsset(b.project, "video", ["plate", "plate"], "a"),
    ).toThrow("distinct");
    expect(b.project.revision).toBe(1);
  });
  it("protects generation links and shares provenance for aliases", async () => {
    const b = assetFixture();
    b.project.assets.video.origin = "generated";
    b.project.assets.video.generationId = "generated";
    b.project.generations = [
      {
        id: "generated",
        inputAssetIds: [],
        referenceAssetIds: [],
        outputAssetIds: ["video"],
        prompt: "test",
        tool: "fixture",
      },
    ];
    const result = await runDirectorCommand(b, {
      op: "alias-asset",
      revision: 1,
      assetId: "video",
      use: "reference",
    });
    if (!("bundle" in result) || !result.bundle) throw new Error("missing");
    const next = result.bundle;
    const id = next.project.generations[0].outputAssetIds.find(
      (id) => id !== "video",
    )!;
    expect(next.project.assets[id].origin).toBe("generated");
    expect(assetUses(next.project, id)).toContain("Generation generated");
    await expect(
      runDirectorCommand(next, {
        op: "remove-asset",
        revision: 2,
        assetId: id,
      }),
    ).rejects.toThrow("in use");
  });
  it("removes an unused alias without deleting shared bytes", async () => {
    decoder();
    const first = await importAssets(
      assetFixture(),
      [imageFile()],
      "reference",
    );
    const second = await importAssets(
      first.bundle,
      [imageFile()],
      "production",
    );
    const result = await runDirectorCommand(second.bundle, {
      op: "remove-asset",
      revision: 3,
      assetId: first.assetIds[0],
    });
    if (!("bundle" in result) || !result.bundle) throw new Error("missing");
    expect(
      result.bundle.files.has(
        second.bundle.project.assets[second.assetIds[0]].file.path,
      ),
    ).toBe(true);
    await validateFiles(result.bundle);
  });
  it("failed decoding and oversized images leave source bundle untouched", async () => {
    const before = assetFixture();
    const count = before.files.size;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("Cannot decode")),
    );
    await expect(
      importAssets(before, [imageFile()], "production"),
    ).rejects.toThrow("decode");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10000, height: 10000, close() {} }),
    );
    await expect(
      importAssets(before, [imageFile()], "production"),
    ).rejects.toThrow("megapixels");
    expect(before.files.size).toBe(count);
    expect(before.project.revision).toBe(1);
  });
  it.each([
    { op: "import-asset", revision: 1, use: "style" },
    { op: "use-asset", revision: 1, assetId: "video", layerIds: [] },
    { op: "assets", revision: 1 },
  ])("rejects invalid commands %j", (command) =>
    expect(() => parseCommand(command)).toThrow(),
  );
});
