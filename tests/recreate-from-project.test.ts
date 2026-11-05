import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/director/project-copy", () => ({
  copyAvailable: vi.fn(async () => false),
}));
import type { Job } from "../shared/types";
import { bloomTeaser } from "../shared/templates/bloom-teaser";
import { versionSlots } from "../shared/templates/version";
import { addToProjectAssets } from "../src/studio/project-assets";
import { cameraGeneration } from "../src/studio/project-generation";
import { createStudioStore } from "../src/studio/store";
import {
  cameraRecipe,
  openInCamera,
  recipeNote,
} from "../src/director/recreate-in-camera";
import {
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import type { RunInputs } from "../src/run-inputs";
import { validateProject } from "../src/director/validate";
import { assetFixture } from "./director-asset-fixture";

/**
 * Gap 1 and 4 of #64's review: a Camera run sent to the Director keeps its
 * recipe, so the project's Recreate restores the whole run (not a blank
 * "Create in Camera"), from the project's own record and bytes, and names
 * what the project does not hold. No provider call: fetch is stubbed.
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
const mp4 = readFileSync("docs/director-bundle/example/media/test-pattern.mp4");
const bloomA = versionSlots(bloomTeaser).find((s) => s.id === "bloom-h3-a")!;

/** An LTX workflow run with every setting away from its default. */
const job: Job = {
  id: "job-private-1234",
  generator: "video",
  model: "ltx-2.5-open",
  description: "A lantern drifts over the harbour.",
  prompt: "Macro shot. A lantern drifts over the harbour. Neon glow.",
  cameraEnabled: true,
  camera: { "shot-sizes": null, angles: null, movements: "dolly-in" },
  cameraEdits: {},
  duration: 8,
  resolution: "fhd",
  aspectRatio: "9:16",
  draft: false,
  ltxPrompt: {
    main: "A lantern drifts over the harbour.",
    scene: "A foggy harbour at night.",
    character: "",
    action: "The lantern rises slowly.",
    audio: "Distant gulls.",
    light: { lighting: "neon-glow", palette: null, atmosphere: null },
    lightEdits: {},
  },
  sourceId: "source-private-5678",
  upscaleFactor: 2,
  upscaleCreativity: 0,
  imageReferenceCount: 1,
  status: "Ready",
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  costEstimateUsd: 0,
  keyMode: "owner",
};

const inputs: RunInputs = {
  id: job.id,
  savedAt: Date.now(),
  bytes: reference.length * 2,
  generator: job.generator,
  model: job.model,
  description: job.description,
  sentDescription: job.description,
  imageReferences: [reference],
  imageRegions: [],
};

/** The take route answers with the recorded recipe; data URLs still load. */
const load = (async (url: RequestInfo | URL) => {
  const href = String(url);
  if (href.startsWith("data:")) return fetch(href);
  expect(href).toBe(`/api/takes/${job.id}`);
  return Response.json({
    take: {
      recipe: {
        id: "ltx-2-5-open",
        version: 1,
        route: "workflow",
        location: "cloud",
        workflow: "private-template.json",
        deployment: { url: "https://private.invalid", name: "x" },
      },
    },
  });
}) as typeof fetch;

async function sent() {
  const store = createStudioStore();
  store.getState().actions.initialize(assetFixture());
  const generation = await cameraGeneration(job, load, {
    load: async () => inputs,
  } as never);
  const added = await addToProjectAssets(
    {
      blob: new Blob([mp4], { type: "video/mp4" }),
      filename: "genobi-study.mp4",
      use: "production",
      generation,
    },
    store,
  );
  return { store, added, bundle: store.getState().director.bundle! };
}

describe("a Camera run sent to the Director", () => {
  it("lands as a generated asset with its recipe, settings and references", async () => {
    const { added, bundle, store } = await sent();
    const p = bundle.project;
    const asset = p.assets[added.assetId];
    expect(asset.origin).toBe("generated");
    const g = p.generations.find((x) => x.id === asset.generationId)!;
    expect(g.prompt).toBe(job.prompt);
    expect(g.recipe).toEqual({
      id: "ltx-2-5-open",
      version: 1,
      route: "workflow",
      location: "cloud",
    });
    expect(g.settings).toMatchObject({
      duration: 8,
      aspectRatio: "9:16",
      resolution: "fhd",
      ltxPrompt: job.ltxPrompt,
    });
    expect(g.referenceAssetIds).toHaveLength(1);
    const ref = p.assets[g.referenceAssetIds[0]];
    expect(ref).toMatchObject({ kind: "image", use: "reference" });
    expect(bundle.files.get(ref.file.path)?.byteLength).toBe(png.byteLength);
    // Private lineage never enters the project.
    const text = JSON.stringify(p);
    for (const secret of [
      job.id,
      "source-private-5678",
      "private-template",
      "private.invalid",
    ])
      expect(text).not.toContain(secret);
    expect(() => validateProject(structuredClone(p))).not.toThrow();
    // One edit: one Undo takes the output, its record and references back.
    const count = Object.keys(assetFixture().project.assets).length;
    store.getState().actions.undo();
    expect(
      Object.keys(store.getState().director.bundle!.project.assets),
    ).toHaveLength(count);
  });

  it("Recreate restores the whole run and names only what is not held", async () => {
    const { added, bundle } = await sent();
    const recipe = cameraRecipe(bundle.project, bloomA, [added.assetId]);
    expect(recipe.label).toBe("Recreate in Camera");
    expect(recipe.entry?.id).toBe("ltx-2-5-open");
    expect(recipe.location).toBe("cloud");
    expect(recipe.imageIds).toHaveLength(1);
    // A text-to-video LTX run reads no source clip: nothing is missing.
    expect(recipe.missing).toEqual([]);
    stop = onCameraRecipe((r) => received.push(r));
    await openInCamera(() => {}, recipe, bundle.project, bundle.files);
    const [{ job: restored, patch, note, location }] = received;
    expect(location).toBe("cloud");
    expect(patch.imageReferences).toEqual([reference]);
    expect(note).toContain(
      "Restored this asset's prompt, model, settings, run location and references.",
    );
    expect(note).not.toContain("Not stored");
    const state = composerReducer(
      { ...initialComposer, duration: 5, aspectRatio: "16:9" },
      { type: "restore", job: restored! },
    );
    expect(state.model).toBe("ltx-2.5-open");
    expect(state.duration).toBe(8);
    expect(state.aspectRatio).toBe("9:16");
    expect(state.resolution).toBe("fhd");
    expect(state.description).toBe(job.ltxPrompt!.main);
    expect(state.slots.scene).toBe("A foggy harbour at night.");
    expect(state.slots.audio).toBe("Distant gulls.");
    expect(state.light.lighting).toBe("neon-glow");
    expect(state.camera.movements).toBe("dolly-in");
  });

  it("restore then handoff patch sends the run's own request, wording composed once", async () => {
    const { added, bundle } = await sent();
    const recipe = cameraRecipe(bundle.project, bloomA, [added.assetId]);
    stop = onCameraRecipe((r) => received.push(r));
    await openInCamera(() => {}, recipe, bundle.project, bundle.files);
    const [{ job: restored, patch }] = received;
    // What useComposerRecreate does: the restore, then the patch as an edit.
    const landed = composerReducer(
      composerReducer(initialComposer, { type: "restore", job: restored! }),
      { type: "update", patch },
    );
    // The run as Camera first sent it: the same job, its references held.
    const original = composerReducer(initialComposer, {
      type: "restore",
      job,
      inputs,
    });
    const request = (state: typeof landed) => {
      const { sourceId: _source, ...rest } = composerInput(state);
      return JSON.stringify(rest);
    };
    expect(landed.description).toBe(job.ltxPrompt!.main);
    expect(request(landed)).toBe(request(original));
  });

  it("an imported record's malformed nested settings are dropped, not restored", async () => {
    const { added, bundle } = await sent();
    const project = structuredClone(bundle.project);
    const g = project.generations.find(
      (x) => x.id === project.assets[added.assetId].generationId,
    )!;
    g.settings = {
      ...g.settings,
      ltxPrompt: { main: 42 },
      camera: { angles: "not-a-term" },
      cameraEdits: { "dolly-in": 7 },
      acoustic: { mode: "nowhere" },
      swap: { size: 3, seed: -1 },
    } as never;
    // A bundle from anywhere: the project still opens.
    expect(() => validateProject(structuredClone(project))).not.toThrow();
    const recipe = cameraRecipe(project, bloomA, [added.assetId]);
    for (const key of [
      "ltxPrompt",
      "camera",
      "cameraEdits",
      "acoustic",
      "swap",
    ])
      expect(recipe.job, key).not.toHaveProperty(key);
    expect(recipe.job?.duration).toBe(8);
    const state = composerReducer(initialComposer, {
      type: "restore",
      job: recipe.job!,
    });
    expect(() => composerInput(state)).not.toThrow();
  });

  it("an older upload without a record still says Create in Camera", () => {
    const p = assetFixture().project;
    const [id] = Object.keys(p.assets);
    expect(cameraRecipe(p, bloomA, [id]).label).toBe("Create in Camera");
    expect(recipeNote(cameraRecipe(p, bloomA, [id]), 0)).toMatch(
      /Settings not stored/,
    );
  });
});
