import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import {
  keptInputs,
  otherUrl,
  pngUrl,
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

/** The request a composer state sends, less the session's own source id. */
const request = (state: typeof initialComposer) => {
  const { sourceId: _source, ...rest } = composerInput(state);
  return JSON.stringify(rest);
};

it("keeps a legacy camera preset, so Recreate sends the preset's wording", async () => {
  const job = readyJob({
    generator: "video",
    model: "flux-3",
    description: "A lighthouse in a storm.",
    prompt: "Low angle. A lighthouse in a storm.",
    cameraEnabled: true,
    presetId: "low",
  });
  delete (job as { camera?: unknown }).camera;
  const original = composerReducer(initialComposer, { type: "restore", job });
  expect(original.camera.angles).toBe("low-angle");
  const { added, bundle } = await sendJob(job, {});
  const { landed } = await recreate(bundle, added.assetId);
  expect(landed.camera.angles).toBe("low-angle");
  expect(request(landed)).toBe(request(original));
});

it("keeps every reference slot in order when the same image fills two", async () => {
  const references = [pngUrl, pngUrl, otherUrl];
  const job = readyJob({
    generator: "edit",
    model: "flux-3-klein-api",
    description: "Put image 3's hat on the figure from image 2.",
    prompt: "Put image 3's hat on the figure from image 2.",
    imageReferenceCount: 3,
  });
  const { added, bundle } = await sendJob(job, {
    inputs: keptInputs(job, references),
  });
  const g = bundle.project.generations.find(
    (x) => x.id === bundle.project.assets[added.assetId].generationId,
  )!;
  // The project holds each image once.
  expect(g.referenceAssetIds).toHaveLength(2);
  const { handoff, recipe } = await recreate(bundle, added.assetId);
  expect(handoff.patch.imageReferences).toEqual(references);
  expect(recipe.missing.join(" ")).not.toContain("reference images");
});
