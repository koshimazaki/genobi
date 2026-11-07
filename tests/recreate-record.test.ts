import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import {
  composerBlocked,
  upscaleSource,
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import { addToProjectAssets } from "../src/studio/project-assets";
import { cameraGeneration } from "../src/studio/project-generation";
import {
  canUndoSend,
  sendToDirector,
  undoSend,
} from "../src/studio/send-to-director";
import { createStudioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";
import {
  png,
  takeLoad,
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

it("keeps an Auto video run on Auto and records the route it took beside it", async () => {
  for (const route of ["bfl", "router"]) {
    const job = readyJob({
      generator: "video",
      model: "flux-3",
      videoProvider: "auto",
    });
    const { added, bundle } = await sendJob(job, {
      load: takeLoad({ id: "flux-3-video", version: 1, route }),
    });
    const generation = bundle.project.generations.at(-1)!;
    expect(generation.settings?.videoProvider).toBe("auto");
    expect(generation.settings?.videoProviderUsed).toBe(
      route === "bfl" ? "bfl" : "comfy",
    );
    const { recipe, landed } = await recreate(bundle, added.assetId);
    expect(recipe.videoProvider).toBeUndefined();
    expect(landed.videoProvider).toBe("auto");
    expect(recipe.providerNote).toContain(
      route === "bfl" ? "BFL direct" : "Comfy Router",
    );
    expect(recipe.missing.join(" ")).not.toContain("provider");
  }
});

it("restores an explicit video provider choice as that choice", async () => {
  for (const choice of ["bfl", "comfy"] as const) {
    const job = readyJob({
      generator: "video",
      model: "flux-3",
      videoProvider: choice,
    });
    const { added, bundle } = await sendJob(job, {
      load: takeLoad({
        id: "flux-3-video",
        version: 1,
        route: choice === "bfl" ? "bfl" : "router",
      }),
    });
    const { recipe, landed } = await recreate(bundle, added.assetId);
    expect(recipe.videoProvider).toBe(choice);
    expect(landed.videoProvider).toBe(choice);
  }
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

const mp4 = () => ({
  blob: new Blob(
    [readFileSync("docs/director-bundle/example/media/test-pattern.mp4")],
    { type: "video/mp4" },
  ),
  name: "upscaled.mp4",
});

it.each([
  ["SeedVR2", "seedvr2-upscale", "seedvr2-upscale"],
  ["FLUX with no prompt", "flux-3", "flux-video-upscale"],
])(
  "recreates a %s upscale that had no prompt from its recorded settings",
  async (_name, model, entryId) => {
    const job = readyJob({
      generator: "upscale",
      model: model as never,
      description: "",
      prompt: "",
      upscalePrompt: "",
      upscaleFactor: 4,
      upscaleCreativity: 0,
      sourceId: "source-private",
    });
    const { added, bundle } = await sendJob(job, {}, mp4());
    const { recipe, landed } = await recreate(bundle, added.assetId);
    expect(recipe.label).toBe("Recreate in Camera");
    expect(recipe.entry?.id).toBe(entryId);
    expect(landed.generator).toBe("upscale");
    expect(landed.upscaleFactor).toBe(4);
  },
);

it("says the recipe was recorded, with Undo, when an earlier upload gains its provenance", async () => {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  const media = () => ({
    blob: new Blob([png], { type: "image/png" }),
    filename: "out.png",
    use: "production" as const,
  });
  const plain = await addToProjectAssets(media(), store);
  expect(plain.added).toBe(true);
  const generation = await cameraGeneration(readyJob({}), takeLoad(), {
    load: async () => undefined,
  } as never);
  const sent = await sendToDirector(
    () => addToProjectAssets({ ...media(), generation }, store),
    store,
  );
  expect(sent.asset.assetId).toBe(plain.assetId);
  expect(sent.message).not.toContain("Already");
  expect(
    store.getState().director.bundle!.project.assets[plain.assetId].origin,
  ).toBe("generated");
  expect(canUndoSend(sent, store)).toBe(true);
  expect(undoSend(sent, store)).toBe(true);
  expect(
    store.getState().director.bundle!.project.assets[plain.assetId].origin,
  ).not.toBe("generated");
});

it("holds Generate on a recreated project upscale until the person picks its source", async () => {
  const job = readyJob({
    generator: "upscale",
    model: "flux-3",
    description: "",
    prompt: "Sharpen the fur.",
    upscalePrompt: "Sharpen the fur.",
    upscaleFactor: 2,
    sourceId: "source-private",
  });
  const { added, bundle } = await sendJob(job, {}, mp4());
  const { landed, handoff } = await recreate(bundle, added.assetId);
  // The newest generated clip is what an empty source would fall back to.
  const clip = (id: string) =>
    ({
      id,
      label: id,
      url: `/media/${id}.mp4`,
      mediaType: "video",
      width: 1280,
      height: 720,
      duration: 5,
      origin: "generated",
    }) as const;
  const sources = [clip("newest"), clip("chosen")];
  const jobs = [
    readyJob({
      id: "newest",
      generator: "video",
      createdAt: "2026-11-05T12:00:00Z",
    }),
  ];
  // As App.tsx derives it: the source Generate would send, then the gate.
  const gate = (state: typeof landed) => {
    const source = upscaleSource(state.sourceId, jobs, sources);
    return {
      source: source?.id,
      blocked: composerBlocked(state, source?.id ?? "", state.upscalePrompt),
    };
  };
  expect(gate(landed)).toEqual({ source: undefined, blocked: true });
  expect(handoff.note).toContain("Generate waits");
  const picked = composerReducer(landed, {
    type: "update",
    patch: { sourceId: "chosen" },
  });
  expect(gate(picked)).toEqual({ source: "chosen", blocked: false });
});
