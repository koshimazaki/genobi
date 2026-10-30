import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addToProjectAssets,
  addedMessage,
  onAssetAdded,
  type AddedAsset,
} from "../src/studio/project-assets";
import { createStudioStore } from "../src/studio/store";
import { assetFixture, imageFile } from "./director-asset-fixture";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../shared/director/types";

// The one studio path for outputs into the project's assets: 3D takes and
// first frames, Dual Swords frames, rendered and saved videos.
beforeEach(() =>
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1280, height: 704, close() {} }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  return store;
}
const png = () => new Blob([imageFile()], { type: "image/png" });

it("adds an output under the tab its use names, with a cleaned name", async () => {
  const store = fixture();
  const told: AddedAsset[] = [];
  const stop = onAssetAdded((asset) => told.push(asset));
  const added = await addToProjectAssets(
    { blob: png(), filename: "../world\x00\x1f-first-frame", use: "reference" },
    store,
  );
  stop();
  const asset = store.getState().director.bundle!.project.assets[added.assetId];
  expect(added).toMatchObject({
    added: true,
    use: "reference",
    filename: "world  -first-frame.png",
  });
  expect(asset).toMatchObject({ kind: "image", use: "reference" });
  expect(asset.file.path).toMatch(/\/world__-first-frame\.png$/);
  expect(store.getState().workspace.assetRole).toBe("reference");
  expect(told).toEqual([added]);
  expect(addedMessage(added)).toBe(
    "world  -first-frame.png added to project assets · Inspirations.",
  );
});

it("says so when the same bytes are already there, and keeps one asset", async () => {
  const store = fixture();
  const first = await addToProjectAssets(
    { blob: png(), filename: "frame.png", use: "production" },
    store,
  );
  const count = Object.keys(
    store.getState().director.bundle!.project.assets,
  ).length;
  const again = await addToProjectAssets(
    { blob: png(), filename: "frame.png", use: "production" },
    store,
  );
  expect(again).toMatchObject({ assetId: first.assetId, added: false });
  expect(addedMessage(again)).toMatch(/already in project assets · Project/);
  expect(
    Object.keys(store.getState().director.bundle!.project.assets),
  ).toHaveLength(count);
});

it.each([
  [new Blob(["webm"], { type: "video/webm" }), "take.webm", /PNG, JPEG/],
  [new Blob([], { type: "image/png" }), "empty.png", /empty/],
  [
    new Blob([new Uint8Array(DIRECTOR_MEDIA_BYTES + 1)], { type: "video/mp4" }),
    "huge.mp4",
    DIRECTOR_MEDIA_LIMIT,
  ],
])(
  "refuses %s without editing the project",
  async (blob, filename, message) => {
    const store = fixture();
    const before = store.getState().director.bundle;
    await expect(
      addToProjectAssets({ blob, filename, use: "production" }, store),
    ).rejects.toThrow(message);
    expect(store.getState().director.bundle).toBe(before);
  },
);

it("waits for the project to open", async () => {
  await expect(
    addToProjectAssets(
      { blob: png(), filename: "frame.png", use: "production" },
      createStudioStore(),
    ),
  ).rejects.toThrow(/still opening/);
});
