// Sends a Camera job to a fresh Director project the way Send to Director
// does, and lands its Recreate in a composer, for the recreate record tests.
import { readFileSync } from "node:fs";
import { expect, vi } from "vitest";
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
import { composerReducer, initialComposer } from "../src/useComposer";
import type { RunInputs } from "../src/run-inputs";
import { validateProject } from "../src/director/validate";
import { assetFixture } from "./director-asset-fixture";

export const png = readFileSync("public/scrolls/creature.png");
export const pngUrl = `data:image/png;base64,${png.toString("base64")}`;
export const jpg = readFileSync("tests/fixtures/reference.png");
export const otherUrl = `data:image/png;base64,${jpg.toString("base64")}`;
export const bloomA = versionSlots(bloomTeaser).find(
  (s) => s.id === "bloom-h3-a",
)!;

/** A Ready job with the composer's defaults, overridden per test. */
export function readyJob(patch: Partial<Job>): Job {
  return {
    id: "job-private-record",
    generator: "image",
    model: "flux-3",
    description: "A forest at dawn.",
    prompt: "A forest at dawn.",
    cameraEnabled: false,
    duration: 5,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    status: "Ready",
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
    costEstimateUsd: 0,
    keyMode: "owner",
    ...patch,
  } as Job;
}

/** Run inputs this browser kept for the job (references, no regions). */
export function keptInputs(job: Job, imageReferences: string[]): RunInputs {
  return {
    id: job.id,
    savedAt: Date.now(),
    bytes: imageReferences.join("").length * 2,
    generator: job.generator,
    model: job.model,
    description: job.description,
    sentDescription: job.description,
    imageReferences,
    imageRegions: [],
  };
}

/** The take route: `take` answers with that recipe, otherwise take_missing. */
export const takeLoad = (take?: unknown) =>
  (async (url: RequestInfo | URL) => {
    const href = String(url);
    if (href.startsWith("data:")) return fetch(href);
    return take
      ? Response.json({ take: { recipe: take } })
      : Response.json({ code: "take_missing" }, { status: 404 });
  }) as typeof fetch;

export function stubBitmaps() {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 640, height: 640, close() {} }),
  );
}

/** Sends the job's output to a fresh project; returns the store and asset. */
export async function sendJob(
  job: Job,
  { load = takeLoad(), inputs }: { load?: typeof fetch; inputs?: RunInputs },
  output = { blob: new Blob([png], { type: "image/png" }), name: "out.png" },
) {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  const generation = await cameraGeneration(job, load, {
    load: async () => inputs,
  } as never);
  const added = await addToProjectAssets(
    {
      blob: output.blob,
      filename: output.name,
      use: "production",
      generation,
    },
    store,
  );
  const bundle = store.getState().director.bundle!;
  expect(() => validateProject(structuredClone(bundle.project))).not.toThrow();
  return { store, added, bundle };
}

/** The project's Recreate, landed as useComposerRecreate lands it. */
export async function recreate(
  bundle: ReturnType<typeof assetFixture>,
  id: string,
) {
  const recipe = cameraRecipe(bundle.project, bloomA, [id]);
  const received: CameraRecipePatch[] = [];
  const stop = onCameraRecipe((r) => received.push(r));
  try {
    await openInCamera(() => {}, recipe, bundle.project, bundle.files);
  } finally {
    stop();
  }
  const [handoff] = received;
  const restored = handoff.job
    ? composerReducer(initialComposer, { type: "restore", job: handoff.job })
    : initialComposer;
  const landed = composerReducer(restored, {
    type: "update",
    patch: handoff.patch,
  });
  return { recipe, handoff, landed };
}
