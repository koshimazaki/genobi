import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importGalleryMedia } from "../src/director/import-gallery-media";
import { createStudioStore } from "../src/studio/store";
import { assetFixture, imageFile } from "./director-asset-fixture";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../shared/director/types";

beforeEach(() =>
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({
      width: 2736,
      height: 1536,
      close() {},
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  return store;
}
const imageResponse = () =>
  new Response(imageFile(), { headers: { "content-type": "image/png" } });

it("adds a production asset without altering layers and supports undo", async () => {
  const store = fixture();
  const before = store.getState().director.bundle!;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse()));
  await importGalleryMedia("/api/jobs/owned/result", "forest.png", store);
  const after = store.getState().director.bundle!;
  expect(after.project.layers).toEqual(before.project.layers);
  const added = Object.entries(after.project.assets).filter(
    ([id]) => !before.project.assets[id],
  );
  expect(added).toHaveLength(1);
  expect(added[0][1].use).toBe("production");
  expect(after.files.has(added[0][1].file.path)).toBe(true);
  store.getState().actions.undo();
  expect(store.getState().director.bundle!.project.assets).toEqual(
    before.project.assets,
  );
});

it("rejects a project switch while a result is downloading", async () => {
  const store = fixture();
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const pending = importGalleryMedia(
    "/api/jobs/owned/result",
    "forest.png",
    store,
  );
  const other = assetFixture();
  other.project.id = "other";
  store.getState().actions.commit(other, store.getState().director.bundle);
  resolve(imageResponse());
  await expect(pending).rejects.toThrow("Project changed");
  expect(store.getState().director.bundle!.project.assets).toEqual(
    other.project.assets,
  );
});

it.each([
  [new Response("expired", { status: 404 }), "unavailable"],
  [
    new Response("<html>", { headers: { "content-type": "text/html" } }),
    "Choose",
  ],
  [
    new Response("oversized", {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(DIRECTOR_MEDIA_BYTES + 1),
      },
    }),
    DIRECTOR_MEDIA_LIMIT,
  ],
])(
  "rejects unusable downloads without editing the project",
  async (response, message) => {
    const store = fixture();
    const before = store.getState().director.bundle;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      importGalleryMedia("/result", "result.png", store),
    ).rejects.toThrow(message);
    expect(store.getState().director.bundle).toBe(before);
  },
);

it("enforces the limit even when the download has no content length", async () => {
  const store = fixture();
  const before = store.getState().director.bundle;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array(DIRECTOR_MEDIA_BYTES + 1), {
        headers: { "content-type": "video/mp4" },
      }),
    ),
  );
  await expect(
    importGalleryMedia("/result", "result.mp4", store),
  ).rejects.toThrow(DIRECTOR_MEDIA_LIMIT);
  expect(store.getState().director.bundle).toBe(before);
});
