import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import type { Job } from "../shared/types";
import { bloomTeaser } from "../shared/templates/bloom-teaser";
import { versionSlots } from "../shared/templates/version";
import { addToProjectAssets } from "../src/studio/project-assets";
import { cameraGeneration } from "../src/studio/project-generation";
import { createStudioStore } from "../src/studio/store";
import { cameraRecipe, openInCamera } from "../src/director/recreate-in-camera";
import {
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import { imagePrompt, type ImageRegion } from "../src/image-regions";
import type { RunInputs } from "../src/run-inputs";
import { validateProject } from "../src/director/validate";
import { assetFixture } from "./director-asset-fixture";

/**
 * A Klein edit with boxes: the boxes' keep/move/remove/change instructions are
 * composed into the description the provider received. The project keeps that
 * composed prompt (the boxes themselves are not stored), so a Recreate sends
 * the same instructions and Camera's notice names the boxes as not stored.
 */
beforeEach(() =>
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 640, height: 640, close() {} }),
  ),
);
let received: CameraRecipePatch[] = [];
let stop: (() => void) | undefined;
afterEach(() => {
  vi.unstubAllGlobals();
  stop?.();
  received = [];
});

const png = readFileSync("public/scrolls/creature.png");
const reference = `data:image/png;base64,${png.toString("base64")}`;
const bloomA = versionSlots(bloomTeaser).find((s) => s.id === "bloom-h3-a")!;
const regions: ImageRegion[] = [
  {
    id: "box_1",
    box: [100, 100, 400, 400],
    action: "remove",
    description: "the lamp post",
  },
];
const words = "Make the street wet after rain.";
const composed = imagePrompt(words, regions, true);

const job: Job = {
  id: "job-private-klein",
  generator: "edit",
  model: "flux-3-klein-api",
  description: composed,
  prompt: composed,
  cameraEnabled: false,
  camera: { "shot-sizes": null, angles: null, movements: null },
  cameraEdits: {},
  duration: 5,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
  upscaleFactor: 2,
  upscaleCreativity: 0,
  imageResolution: "1k",
  imageAspectRatio: "auto",
  imageGrounding: false,
  imageSafetyTolerance: 2,
  imageReferenceCount: 1,
  status: "Ready",
  createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z",
  costEstimateUsd: 0,
  keyMode: "owner",
};
const inputs: RunInputs = {
  id: job.id,
  savedAt: Date.now(),
  bytes: reference.length * 2,
  generator: job.generator,
  model: job.model,
  description: words,
  sentDescription: composed,
  imageReferences: [reference],
  imageRegions: regions,
};
const load = (async (url: RequestInfo | URL) => {
  const href = String(url);
  if (href.startsWith("data:")) return fetch(href);
  return new Response(null, { status: 404 });
}) as typeof fetch;

it("keeps a Klein edit's box instructions in the recorded prompt and names the boxes", async () => {
  expect(composed).not.toBe(words);
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  const generation = await cameraGeneration(job, load, {
    load: async () => inputs,
  } as never);
  expect(generation.settings?.description).toBe(composed);
  const added = await addToProjectAssets(
    {
      blob: new Blob([png], { type: "image/png" }),
      filename: "genobi-edit.png",
      use: "production",
      generation,
    },
    store,
  );
  const bundle = store.getState().director.bundle!;
  expect(() => validateProject(structuredClone(bundle.project))).not.toThrow();
  const recipe = cameraRecipe(bundle.project, bloomA, [added.assetId]);
  stop = onCameraRecipe((r) => received.push(r));
  await openInCamera(() => {}, recipe, bundle.project, bundle.files);
  const [{ job: restored, patch, note }] = received;
  expect(note).toContain("region boxes");
  const landed = composerReducer(
    composerReducer(initialComposer, { type: "restore", job: restored! }),
    { type: "update", patch },
  );
  // The same instructions reach the provider, composed once.
  expect(composerInput(landed).description).toBe(job.description);
});
