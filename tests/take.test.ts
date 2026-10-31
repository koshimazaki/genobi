import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalInput } from "../shared/idempotency";
import { registry } from "../shared/registry";
import { sha256Hex, startTake, takeOf, takeOutputs } from "../shared/take";
import type { GenerateInput, Job } from "../shared/types";

const video: GenerateInput = {
  generator: "video",
  model: "flux-3",
  description: "A ceramic vessel.",
  camera: { "shot-sizes": "close-up", angles: "dutch", movements: "pan" },
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
  upscaleFactor: 2,
  upscaleCreativity: 0,
};

const ready = (overrides: Partial<Job> = {}): Job => ({
  ...video,
  id: "job-1",
  prompt: "A ceramic vessel.",
  status: "Ready",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:01:00.000Z",
  costEstimateUsd: 0.85,
  keyMode: "byo",
  ...overrides,
});

describe("the take contract", () => {
  it("hashes with SHA-256 the way Node does", async () => {
    expect(await sha256Hex("genobi")).toBe(
      createHash("sha256").update("genobi").digest("hex"),
    );
  });

  it("records the settings hash replay compares, whatever the key order", async () => {
    const start = await startTake(video, false);
    expect(start.inputs).toEqual([
      { role: "settings", sha256: await sha256Hex(canonicalInput(video)) },
    ]);
    // An omitted default and reordered camera keys are the same request.
    const { aspectRatio: _ratio, ...omitted } = video;
    const reordered = {
      ...omitted,
      camera: { movements: "pan", angles: "dutch", "shot-sizes": "close-up" },
    } as GenerateInput;
    expect((await startTake(reordered, false)).inputs).toEqual(start.inputs);
    const changed = await startTake({ ...video, projectRevision: 3 }, false);
    expect(changed.inputs).not.toEqual(start.inputs);
  });

  it("names the route the key reaches, not only the entry's own", async () => {
    expect((await startTake(video, true)).recipe).toEqual({
      id: "flux-3-video",
      version: 1,
      route: "router",
    });
    expect((await startTake(video, false)).recipe.route).toBe("bfl");
    const acoustic = await startTake(
      { ...video, model: "ltx-2.5-akuspace" },
      true,
    );
    expect(acoustic.recipe).toEqual({
      id: "ltx-2-5-akuspace",
      version: 2,
      route: "workflow",
    });
  });

  it("lists reference hashes in order and the upscale source by id", async () => {
    const edit = await startTake(
      {
        ...video,
        generator: "edit",
        imageReferences: ["a".repeat(64), "b".repeat(64)],
      },
      false,
    );
    expect(edit.recipe.id).toBe("flux-3-edit");
    expect(edit.inputs.slice(1)).toEqual([
      { role: "reference", sha256: "a".repeat(64) },
      { role: "reference", sha256: "b".repeat(64) },
    ]);
    const upscale = await startTake(
      { ...video, generator: "upscale", sourceId: "clip-7" },
      false,
    );
    expect(upscale.recipe.id).toBe("flux-video-upscale");
    expect(upscale.inputs.at(-1)).toEqual({
      role: "source",
      assetId: "clip-7",
    });
  });

  it("is a take only once the output is ours", async () => {
    const start = await startTake(video, false);
    for (const status of ["submitting", "Generating", "copying", "Error"])
      expect(takeOf(ready({ status: status as Job["status"] }), start)).toBe(
        null,
      );
    expect(
      takeOf(
        ready({ costActualUsd: 0.85, costCredits: 85, projectRevision: 4 }),
        start,
      ),
    ).toEqual({
      version: 1,
      operationId: "job-1",
      recipe: start.recipe,
      inputs: start.inputs,
      outputs: [
        {
          assetId: "job-1",
          mediaType: "video",
          contentType: "video/mp4",
          available: true,
        },
      ],
      receipt: { estimateUsd: 0.85, actualUsd: 0.85, credits: 85 },
      projectRevision: 4,
      createdAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("keeps the take when quota removes its media", async () => {
    const start = await startTake(video, false);
    const take = takeOf(ready({ mediaAvailable: false }), start)!;
    expect(take.outputs[0].available).toBe(false);
    expect(take.receipt).toEqual({ estimateUsd: 0.85 });
    expect(take).not.toHaveProperty("projectRevision");
    const image = takeOf(
      ready({ mediaType: "image", resultContentType: "image/png" }),
      start,
    )!;
    expect(image.outputs[0]).toMatchObject({
      mediaType: "image",
      contentType: "image/png",
    });
  });

  it("gives every runnable entry a recipe version", () => {
    for (const entry of registry)
      if (entry.status === "ready")
        expect(Number.isInteger(entry.recipeVersion)).toBe(true);
  });

  it("discovers only owned companion routes and keeps legacy MIME uncertainty explicit", () => {
    const companions = [
      {
        assetId: "job-1-audio-3",
        label: "Wet",
        url: "/api/clips/job-1-audio-3",
        contentType: "audio/wav",
      },
      { label: "Legacy", url: "/api/clips/job-1-audio-4" },
      { label: "Duplicate", url: "/api/clips/job-1-audio-3" },
      {
        assetId: "different",
        label: "Mismatch",
        url: "/api/clips/job-1-audio-5",
      },
      { label: "Provider", url: "https://delivery.example/secret.wav" },
    ];
    const outputs = takeOutputs(ready({ companions }));
    expect(outputs).toHaveLength(3);
    expect(outputs[1]).toMatchObject({
      assetId: "job-1-audio-3",
      mediaType: "audio",
      contentType: "audio/wav",
      label: "Wet",
    });
    expect(outputs[2]).toMatchObject({
      contentType: "application/octet-stream",
    });
    expect(
      takeOutputs(ready({ companions, mediaAvailable: false })).every(
        (output) => !output.available,
      ),
    ).toBe(true);
  });
});
