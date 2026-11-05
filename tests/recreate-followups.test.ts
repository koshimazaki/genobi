import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import { composerBlocked, composerInput } from "../src/useComposer";
import { publicGenerationSettings } from "../shared/director/generation-settings";
import { INSPIRATION_INPUT_NOTICE } from "../shared/director/reference-role";
import {
  keptInputs,
  pngUrl,
  readyJob,
  recreate,
  sendJob,
  stubBitmaps,
  takeLoad,
} from "./recreate-record-harness";

beforeEach(stubBitmaps);
afterEach(() => vi.unstubAllGlobals());

it.each(["flux-3-klein", "flux-3-klein-api"] as const)(
  "keeps a saved %s edit blocked when its original references are missing",
  async (model) => {
    const job = readyJob({ generator: "edit", model, imageReferenceCount: 1 });
    const { added, bundle } = await sendJob(job, {});
    const { recipe, handoff, landed } = await recreate(bundle, added.assetId);
    expect(recipe.job?.generator).toBe("edit");
    expect(handoff.patch.generator).toBe("edit");
    expect(landed.generator).toBe("edit");
    expect(landed.imageReferences).toEqual([]);
    expect(composerBlocked(landed, "", composerInput(landed).description)).toBe(
      true,
    );
    expect(handoff.note).toContain("reference images (reattach them)");
  },
);

it.each([
  ["bfl", "BFL direct"],
  ["router", "Comfy Router"],
] as const)(
  "names the actual %s route while preserving the recorded Auto choice",
  async (route, name) => {
    const job = readyJob({ imageProvider: "auto" });
    const { added, bundle } = await sendJob(job, {
      load: takeLoad({ id: "flux-3-image", version: 1, route }),
    });
    const { recipe, handoff, landed } = await recreate(bundle, added.assetId);
    expect(recipe.missing.join(" ")).not.toContain("provider");
    expect(handoff.note).toContain(
      `Recorded provider: ${name}; Camera keeps Auto.`,
    );
    expect(landed.imageProvider).toBe("auto");
  },
);

it("does not accept an arbitrary provider claim from imported settings", () => {
  expect(
    publicGenerationSettings({ imageProviderUsed: "private-provider-token" }),
  ).toBeUndefined();
});

it("keeps H3's duplicated input slots and makes the restored Inspiration use visible", async () => {
  const job = readyJob({
    generator: "video",
    model: "minimax-h3",
    imageReferenceCount: 2,
    description: "Image 1 and image 2 show the same creature.",
    prompt: "Image 1 and image 2 show the same creature.",
  });
  const { added, bundle } = await sendJob(job, {
    inputs: keptInputs(job, [pngUrl, pngUrl]),
  });
  const { handoff, landed } = await recreate(bundle, added.assetId);
  expect(landed.imageReferences).toEqual([pngUrl, pngUrl]);
  expect(handoff.note).toContain(INSPIRATION_INPUT_NOTICE);
  expect(handoff.note).not.toContain("reference images (reattach them)");
});

it("keeps camera-only wording without composing it into the description twice", async () => {
  const job = readyJob({
    generator: "video",
    model: "flux-3",
    description: "",
    prompt: "Low angle.",
    cameraEnabled: true,
    presetId: "low",
  });
  const { added, bundle } = await sendJob(job, {});
  const { landed } = await recreate(bundle, added.assetId);
  expect(landed.description).toBe("");
  expect(landed.camera.angles).toBe("low-angle");
});
