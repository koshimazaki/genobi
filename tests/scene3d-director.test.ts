/**
 * The playblast's hand-off into the Director: a real MP4 through the
 * Director's own `addMedia`, and a cancel that lands while that import is
 * reading or inspecting the file (PR 52 re-review).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";

const imports = vi.hoisted(() => ({ during: () => {} }));
vi.mock("../src/director/import-media", async (original) => {
  const actual =
    await original<typeof import("../src/director/import-media")>();
  return {
    ...actual,
    // The real import; a test can act while it is still in flight.
    addMedia: async (...args: Parameters<typeof actual.addMedia>) => {
      const next = await actual.addMedia(...args);
      imports.during();
      return next;
    },
  };
});
const { addPlayblastToDirector } =
  await import("../src/scene3d/add-to-director");

const clip = () =>
  new File(
    [new Uint8Array(readFileSync("tests/fixtures/short-metadata.mp4"))],
    "playblast-push-in-set.mp4",
    { type: "video/mp4" },
  );
function store() {
  const s = createStudioStore();
  s.getState().actions.initialize(assetFixture());
  return s;
}

describe("playblast into the Director", () => {
  it("adds the clip as a named production track at frame 0", async () => {
    imports.during = () => {};
    const s = store();
    const before = s.getState().director.bundle!;
    const id = await addPlayblastToDirector(
      clip(),
      "Playblast · Push in",
      new AbortController().signal,
      s,
    );
    const after = s.getState().director.bundle!;
    expect(after).not.toBe(before);
    const layer = after.project.layers.find((l) => l.id === id)!;
    expect(layer).toMatchObject({
      name: "Playblast · Push in",
      kind: "video",
      startFrame: 0,
    });
    const asset = after.project.assets[(layer as { assetId: string }).assetId];
    expect(asset).toMatchObject({ kind: "video", use: "production" });
    expect(s.getState().operations.workingFile).toBe(false);
  });

  it("commits nothing when cancelled while the import runs", async () => {
    const s = store();
    const before = s.getState().director.bundle!;
    const controller = new AbortController();
    imports.during = () => controller.abort();
    await expect(
      addPlayblastToDirector(clip(), "Playblast", controller.signal, s),
    ).rejects.toThrow();
    expect(s.getState().director.bundle).toBe(before);
    expect(s.getState().director.history).toHaveLength(0);
    expect(s.getState().operations.workingFile).toBe(false);
  });

  it("does not start an import that was already cancelled", async () => {
    const s = store();
    const before = s.getState().director.bundle!;
    const controller = new AbortController();
    controller.abort();
    let started = false;
    imports.during = () => (started = true);
    await expect(
      addPlayblastToDirector(clip(), "Playblast", controller.signal, s),
    ).rejects.toThrow();
    expect(started).toBe(false);
    expect(s.getState().director.bundle).toBe(before);
  });
});
