import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import {
  recreate,
  readyJob,
  sendJob,
  stubBitmaps,
} from "./recreate-record-harness";

/**
 * What a Camera run sent to the Director must keep for its Recreate, beyond
 * `recreate-from-project.test.ts`: the provider the person chose, a legacy
 * camera preset, every reference slot in order, prompt-less upscales, and
 * accurate feedback when an upload's provenance is upgraded.
 */
beforeEach(stubBitmaps);
afterEach(() => vi.unstubAllGlobals());

it("keeps a FLUX still's Auto provider when the take cannot be read, and names the provider as unknown", async () => {
  const job = readyJob({ imageProvider: "auto" });
  const { added, bundle } = await sendJob(job, {});
  const { recipe, handoff, landed } = await recreate(bundle, added.assetId);
  expect(recipe.imageProvider).toBeUndefined();
  expect(handoff.patch).not.toHaveProperty("imageProvider");
  expect(landed.imageProvider).toBe("auto");
  expect(recipe.missing.join(" ")).toContain("provider");
});
