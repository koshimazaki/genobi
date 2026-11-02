import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { registry, entryFor, type ReadyEntry } from "../shared/registry";
import type { Job } from "../shared/types";
import { composerReducer, initialComposer } from "../src/useComposer";
import type { RunInputs } from "../src/run-inputs";
import { recreateGaps, recreateNeeds } from "../src/recreate-gaps";

/**
 * Camera's Recreate over every model the menu can hold (#57 scope addition):
 * each ready registry entry is read from source, so a new model joins this
 * table by being added to the registry. For each: the run's generator and
 * model come back, and every input it needs is either restored or named as
 * not stored — never silently dropped.
 */
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const ready = registry.filter((e): e is ReadyEntry => e.status === "ready");

function jobFor(entry: ReadyEntry, complete: boolean): Job {
  const needs = recreateNeeds({
    generator: entry.generator,
    model: entry.videoModel,
  });
  return {
    id: `job-${entry.id}`,
    generator: entry.generator,
    model: entry.videoModel,
    description: `a fox, made with ${entry.id}`,
    prompt: `a fox, made with ${entry.id}`,
    cameraEnabled: false,
    duration: 5,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    status: "Ready",
    createdAt: "2026-11-02T10:00:00Z",
    updatedAt: "2026-11-02T10:00:00Z",
    costEstimateUsd: 0,
    keyMode: "byo",
    ...(needs.references ? { imageReferenceCount: 1 } : {}),
    ...(complete && needs.source ? { sourceId: "source-clip" } : {}),
    ...(complete && needs.swap
      ? { swap: { start: 0, size: 480 as const, seed: 7 } }
      : {}),
    ...(complete && needs.deploy
      ? { deploy: { seed: 1, negativePrompt: "", assets: {} } }
      : {}),
  };
}

const inputsFor = (job: Job): RunInputs => ({
  id: job.id,
  savedAt: Date.now(),
  bytes: ref.length * 2,
  generator: job.generator,
  model: job.model,
  description: job.description,
  sentDescription: job.description,
  imageReferences: [ref],
  imageRegions: [],
});

describe.each(ready.map((entry) => [entry.id, entry] as const))(
  "Recreate %s",
  (_id, entry) => {
    const needs = recreateNeeds({
      generator: entry.generator,
      model: entry.videoModel,
    });

    it("restores its model, prompt and every recorded input", () => {
      const job = jobFor(entry, true);
      const inputs = inputsFor(job);
      const state = composerReducer(initialComposer, {
        type: "restore",
        job,
        inputs,
      });
      expect(entryFor(state.generator, state.model).id).toBe(entry.id);
      if (entry.generator !== "upscale" && entry.generator !== "audio")
        expect(state.description).toBe(job.description);
      if (needs.references) expect(state.imageReferences).toEqual([ref]);
      if (needs.source) expect(state.sourceId).toBe("source-clip");
      if (needs.swap) expect(state.swap).toEqual(job.swap);
      if (needs.deploy) expect(state.deploy).toEqual(job.deploy);
      expect(recreateGaps(job, inputs)).toEqual([]);
    });

    it("names what was not stored instead of looking restored", () => {
      const job = jobFor(entry, false);
      const expected = [
        ...(needs.references ? ["reference images"] : []),
        ...(needs.source ? ["source video"] : []),
        ...(needs.deploy ? ["deployment inputs"] : []),
        ...(needs.swap ? ["swap settings"] : []),
      ];
      expect(recreateGaps(job)).toEqual(expected);
    });
  },
);

it("covers every family the Camera menu offers", () => {
  const families = new Set(ready.map((e) => e.family));
  for (const family of ["ltx", "flux", "h3", "upscale"])
    expect(families.has(family as ReadyEntry["family"])).toBe(true);
  expect(ready.some((e) => e.generator === "image")).toBe(true);
  expect(ready.some((e) => e.generator === "audio")).toBe(true);
});
