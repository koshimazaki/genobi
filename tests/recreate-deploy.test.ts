import { describe, expect, it } from "vitest";
import { publicJob, type StoredJob } from "../server/store";
import { composerReducer, initialComposer } from "../src/useComposer";
import { recreateGapMessage, recreateGaps } from "../src/recreate-gaps";

/**
 * Recreate of an LTX deployment run, through the job the local server
 * actually returns (`publicJob`), not a hand-made one: the seed, negative
 * prompt and capture recipe come back; the session-bound file tickets and
 * every private field stay on the server.
 */
const ticket = "11111111-2222-4333-8444-555555555555";
const recipe = JSON.stringify({
  version: 1,
  fps: 24,
  width: 1024,
  height: 576,
  frames: 193,
});
const stored: StoredJob = {
  id: "job-deploy",
  sessionId: "session-private",
  idempotencyKey: "request-private",
  providerId: "provider-private",
  pollingUrl: "https://provider.invalid/poll",
  resultRemoteUrl: "https://provider.invalid/result",
  generator: "video",
  model: "ltx-deploy-akuspace",
  description: "A ceramic vessel turns.",
  prompt: "A ceramic vessel turns.",
  cameraEnabled: false,
  duration: 8,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
  upscaleFactor: 2,
  upscaleCreativity: 0,
  deployment: { url: "https://genobi.run.comfy.app", name: "genobi" },
  deploy: {
    seed: 98_765,
    negativePrompt: "No cuts, no captions.",
    recipe,
    assets: { REFERENCE_PNG: ticket, TRACK_AUDIO: ticket },
  },
  status: "Ready",
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  costEstimateUsd: 0,
  keyMode: "owner",
};

describe("Recreate of a deployment run, from the server's job", () => {
  const job = publicJob(stored);

  it("returns the deployment inputs without tickets or private fields", () => {
    expect(job.deploy).toEqual({
      seed: 98_765,
      negativePrompt: "No cuts, no captions.",
      recipe,
      assets: {},
    });
    const text = JSON.stringify(job);
    for (const secret of [
      ticket,
      "session-private",
      "request-private",
      "provider-private",
      "provider.invalid",
    ])
      expect(text).not.toContain(secret);
  });

  it("restores the seed and negative prompt, and asks only for the files", () => {
    const state = composerReducer(initialComposer, { type: "restore", job });
    expect(state.deploy?.seed).toBe(98_765);
    expect(state.deploy?.negativePrompt).toBe("No cuts, no captions.");
    expect(state.deploy?.recipe).toBe(recipe);
    const gaps = recreateGaps(job);
    expect(gaps).not.toContain("deployment inputs");
    expect(gaps).toEqual(["deployment input files"]);
    expect(recreateGapMessage(gaps)).toMatch(
      /Not stored for this run: deployment input files\./,
    );
  });
});
