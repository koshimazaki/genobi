import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { ComfySdkWorkflows, type SdkClient } from "../server/comfy-sdk";
import { finishingOn, ServerKeys } from "../server/keys";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { validateInput } from "../server/validation";
import { NotYetWorkflow } from "../shared/comfy/workflow";

// The swap through the job service on a Comfy deployment through the SDK,
// a deployment the server has not set, and a run an earlier build recorded
// on Runware Serverless, which this build no longer has. Fakes only.
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const clip = path.resolve("tests/fixtures/metadata.mp4");
const COMFY_KEY = "comfyui-test-key";
const request = {
  generator: "video",
  model: "openjutsu-swap",
  description: "keep the glasses",
  duration: 5,
  sourceId: "clip",
  imageReferences: [ref, ref],
  swap: { start: 0, size: 480, seed: 9 },
};
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});

async function studio(workflows: WorkflowDestinations, keys: ServerKeys) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-swap-"));
  directories.push(directory);
  const app = await createApp({
    directory,
    publicDirectory: directory,
    workflows,
    keys,
  });
  app.store.data.sources.push({
    id: "clip",
    label: "Clip",
    url: "/api/clips/clip",
    origin: "upload",
    width: 256,
    height: 144,
    duration: 1,
    filePath: clip,
    sessionId: "owner",
    sha256: "clip-hash",
  });
  return { ...app, directory };
}

describe("the swap on its Comfy deployment", () => {
  it("runs through the SDK on the deployment's own base with the Comfy key", async () => {
    const base = "https://openjutsu.run.comfy.app";
    const uploaded: string[] = [];
    const connect = vi.fn(
      (_key: string, _fetcher: unknown, baseUrl?: string): SdkClient => {
        expect(baseUrl).toBe(base);
        return {
          assets: {
            fromBytes: (_bytes, options) => ({
              asReference: async () => {
                uploaded.push(options.filename);
                return { type: "core/ASSET", id: options.filename };
              },
            }),
          },
          workflows: { fromJson: (graph) => graph },
          submit: vi.fn(async () => ({ id: "deploy-job-1" })),
          jobs: {
            get: async () => ({
              id: "deploy-job-1",
              status: "running",
              progress: null,
              outputs: [],
            }),
          },
        };
      },
    );
    const deployment = new ComfySdkWorkflows({
      destination: { kind: "deployment", url: base },
      connect,
      env: {},
    });
    const { service } = await studio(
      new WorkflowDestinations(new NotYetWorkflow(), { deployment }),
      new ServerKeys({ comfy: COMFY_KEY }),
    );
    const input = validateInput(request);
    const quote = await service.quote(input, "owner");
    expect(quote.recipe.location).toBe("deployment");
    expect(quote.billing).toMatch(/Comfy deployment GPU time/);
    const job = await service.submit(
      input,
      "owner",
      "swap-deploy-1",
      undefined,
      quote.id,
    );
    expect(job.status).toBe("Pending");
    expect(job.pollingUrl).toBe(`${base}/api/v2/jobs/deploy-job-1`);
    expect(uploaded.sort()).toEqual([
      "anchor.png",
      "character.png",
      "clip.mp4",
    ]);
    expect((await service.poll(job.id, "owner")).job.status).toBe("Generating");
    expect(connect.mock.calls.every(([key]) => key === COMFY_KEY)).toBe(true);
  });

  it("closes a run an earlier build sent to Runware, without polling it", async () => {
    const deployment = {
      run: vi.fn(async () => "https://openjutsu.run.comfy.app/api/v2/jobs/j"),
      poll: vi.fn(),
      download: vi.fn(),
      owns: () => true,
    };
    const { service, store } = await studio(
      new WorkflowDestinations(new NotYetWorkflow(), { deployment }),
      new ServerKeys({ comfy: COMFY_KEY }),
    );
    const input = validateInput(request);
    const quote = await service.quote(input, "owner");
    const job = await service.submit(
      input,
      "owner",
      "old-1",
      undefined,
      quote.id,
    );
    // As an earlier build recorded it: location "runware", still pending.
    Object.assign(job.take!.recipe, { location: "runware" });
    job.lastPolledAt = 0;
    // It holds no slot, so the Comfy key can still change.
    expect(finishingOn(store.data.jobs, "comfy")).toBe(false);
    const polled = (await service.poll(job.id, "owner")).job;
    expect(polled.status).toBe("expired");
    expect(polled.error).toMatch(/no longer supports/);
    expect(deployment.poll).not.toHaveBeenCalled();
  });
});

describe("the swap on a deployment this server has not set", () => {
  it("refuses at quote, before any quote or job is recorded", async () => {
    // No GENOBI_DEPLOYMENT_URL: the swap has nowhere to go.
    const { service, store } = await studio(
      new WorkflowDestinations(new NotYetWorkflow()),
      new ServerKeys({ comfy: COMFY_KEY }),
    );
    const input = validateInput(request);
    await expect(service.quote(input, "owner")).rejects.toMatchObject({
      status: 503,
      code: "workflow_not_configured",
      message: expect.stringContaining("GENOBI_DEPLOYMENT_URL"),
    });
    await expect(
      service.submit(input, "owner", "swap-unset-1"),
    ).rejects.toMatchObject({ code: "workflow_not_configured" });
    expect(store.data.quotes).toEqual([]);
    expect(store.data.jobs).toEqual([]);
  });
});
