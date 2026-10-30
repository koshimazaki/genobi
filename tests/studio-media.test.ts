import { expect, it } from "vitest";
import { assetFixture } from "./director-asset-fixture";
import { addAssetTrack } from "../src/director/add-asset-track";
import {
  acceptsStudioMedia,
  projectAssetFile,
  studioDropFile,
} from "../src/studio/media-drop";
import { PROJECT_ASSET_DRAG } from "../src/director/asset-drag";
it("adds a reference as a production layer while retaining its role and original bytes", () => {
  const bundle = assetFixture();
  const [id, asset] = Object.entries(bundle.project.assets).find(
    ([, a]) => a.kind === "image",
  )!;
  asset.use = "reference";
  const next = addAssetTrack(bundle, id, 10, 30);
  const layer = next.project.layers.find(
    (l) => !bundle.project.layers.some((old) => old.id === l.id),
  )!;
  expect(next.files).toBe(bundle.files);
  expect(next.project.assets[id].use).toBe("reference");
  expect(layer).toMatchObject({
    startFrame: 10,
    durationFrames: 30,
    kind: "image",
  });
  expect(
    "assetId" in layer && next.project.assets[layer.assetId],
  ).toMatchObject({ use: "production", file: asset.file });
  expect(bundle.project.layers.some((l) => l.id === layer.id)).toBe(false);
});
it("captures real project bytes and validates every internal drop identity", async () => {
  const bundle = assetFixture();
  const [assetId, asset] = Object.entries(bundle.project.assets).find(
    ([, a]) => a.kind === "image",
  )!;
  const file = projectAssetFile(bundle, assetId);
  expect(file.type).toBe("image/svg+xml");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(
    bundle.files.get(asset.file.path),
  );
  const transfer = {
    types: [PROJECT_ASSET_DRAG],
    getData: () =>
      JSON.stringify({
        projectId: "other",
        assetId,
        sha256: asset.file.sha256,
      }),
  } as unknown as DataTransfer;
  await expect(studioDropFile(transfer, bundle)).rejects.toThrow(
    "current project",
  );
  expect(acceptsStudioMedia(["Files"])).toBe(true);
  expect(acceptsStudioMedia(["text/uri-list"])).toBe(false);
});
