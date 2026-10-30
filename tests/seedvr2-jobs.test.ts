import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../server/errors";
import type {
  WorkflowClient,
  WorkflowRunOptions,
  WorkflowTemplate,
} from "../shared/comfy/workflow";
import { input, setup } from "./server-harness";

// SeedVR2 through the local job service on a Comfy key: quoted first, sent
// once after the reservation, never resent. A fake workflow client records
// what would have gone to Comfy; nothing leaves the test.
const comfyKey = { "x-byo-key": "comfyui-test-key-0007" };
const fixture = path.resolve("tests/fixtures/metadata.mp4");

class RecordingWorkflows implements WorkflowClient {
  runs: {
    template: WorkflowTemplate;
    values: Record<string, unknown>;
    options: WorkflowRunOptions;
  }[] = [];
  fail = false;
  run = vi.fn(
    async (
      template: WorkflowTemplate,
      values: Record<string, unknown>,
      _key: string,
      options: WorkflowRunOptions,
    ) => {
      this.runs.push({ template, values, options });
      if (this.fail)
        throw new AppError(
          502,
          "Submission could not be confirmed. Check Comfy usage before trying again.",
          "submission_unknown",
        );
      return "https://cloud.comfy.org/api/v2/jobs/seedvr2-job-1";
    },
  );
  async poll() {
    return { id: "seedvr2-job-1", status: "Generating" };
  }
  async download() {
    return new Response(new Uint8Array());
  }
}

async function seedvr2Setup() {
  const workflows = new RecordingWorkflows();
  const app = await setup(undefined, workflows);
  const uploaded = await fetch(`${app.base}/api/uploads?filename=mix.mp4`, {
    method: "POST",
    headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
    body: new Uint8Array(await readFile(fixture)),
  });
  const { source } = await uploaded.json();
  const request = {
    ...input,
    generator: "upscale",
    model: "seedvr2-upscale",
    sourceId: source.id,
  };
  const quote = (body: object = request) =>
    fetch(`${app.base}/api/quotes`, {
      method: "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        ...comfyKey,
      },
      body: JSON.stringify(body),
    });
  return { ...app, workflows, request, quote };
}

describe("SeedVR2 through the job service", () => {
  it("quotes without sending, then sends once with the clip after reserving", async () => {
    const { quote, post, workflows, request, store } = await seedvr2Setup();
    const quoted = await quote();
    expect(quoted.status).toBe(201);
    const body = await quoted.json();
    expect(body.quote.recipe).toMatchObject({
      id: "seedvr2-upscale",
      route: "workflow",
    });
    // Comfy Cloud is held at FLUX Precise's rate; the quote sends nothing.
    expect(body.quote.estimateUsd).toBeGreaterThan(0);
    expect(workflows.run).not.toHaveBeenCalled();

    const response = await post("seedvr2-once", request, {
      ...comfyKey,
      "Quote-Id": body.quote.id,
    });
    expect(response.status).toBe(202);
    expect(workflows.run).toHaveBeenCalledOnce();
    const [run] = workflows.runs;
    expect(run.template.id).toBe("seedvr2-upscale");
    expect(run.values).toMatchObject({ scale: 2 });
    expect(Object.keys(run.options.files ?? {})).toEqual(["video"]);
    expect(run.options.files!.video.contentType).toBe("video/mp4");
    // The reservation's own id is the submission's idempotency key.
    expect(run.options.idempotencyKey).toBe(store.data.jobs[0].id);
    // A replay of the same request id sends nothing again.
    expect((await post("seedvr2-once", request, comfyKey)).status).toBe(202);
    expect(workflows.run).toHaveBeenCalledOnce();
  });

  it("will not spend a quote on other settings", async () => {
    const { quote, post, workflows, request } = await seedvr2Setup();
    const { quote: quoted } = await (await quote()).json();
    const response = await post(
      "seedvr2-other",
      { ...request, upscaleFactor: 3 },
      { ...comfyKey, "Quote-Id": quoted.id },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(workflows.run).not.toHaveBeenCalled();
  });

  it("needs a Comfy key off a local ComfyUI, refused before a quote", async () => {
    const { base, cookie, workflows, request } = await seedvr2Setup();
    const response = await fetch(`${base}/api/quotes`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "x-byo-key": "bfl-test-key-0007",
      },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("unsupported_model");
    expect(workflows.run).not.toHaveBeenCalled();
  });

  it("records an uncertain submission as an error and never resends it", async () => {
    const { post, workflows, request } = await seedvr2Setup();
    workflows.fail = true;
    const response = await post("seedvr2-uncertain", request, comfyKey);
    const { job } = await response.json();
    expect(job.status).toBe("Error");
    expect(job.error).toMatch(/could not be confirmed/);
    await post("seedvr2-uncertain", request, comfyKey);
    expect(workflows.run).toHaveBeenCalledOnce();
  });
});
