import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { akuspaceWorkflow, ltxWorkflow } from "../shared/comfy/akuspace";
import { NotYetWorkflow } from "../shared/comfy/workflow";
import { RunRestorer } from "../src/run-restore";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { input, setup } from "./server-harness";

// Recreate restores a run's own template and run location: a no-LoRA run made
// on the local ComfyUI is recreated there on the no-LoRA graph, even after the
// session switched back to the default and to Cloud.
const mp4 = await readFile(
  path.join(import.meta.dirname, "fixtures/metadata.mp4"),
);
const acoustic = {
  ...input,
  model: "ltx-2.5-akuspace",
  duration: 6,
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
};

let fake: FakeComfy | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await fake?.close();
  fake = undefined;
});

async function studio() {
  fake = await fakeComfy({
    nodes: {
      ...nodesFor(akuspaceWorkflow.graph),
      ...nodesFor(ltxWorkflow.graph),
    },
    outputs: {
      "75": {
        images: [{ filename: "LTX_00001_.mp4", subfolder: "", type: "output" }],
        animated: [true],
      },
    },
    media: new Uint8Array(mp4),
  });
  const local = new LocalComfyWorkflows({ url: fake.url });
  const app = await setup(
    undefined,
    new WorkflowDestinations(new NotYetWorkflow(), local),
    {
      destination: { kind: "cloud" },
      local,
    },
  );
  const send = (
    route: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${app.base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...app, send, fake };
}

describe("Recreate restores the run's template and run location", () => {
  it("brings back the no-LoRA graph and Local before the next quote", async () => {
    const { send, base, cookie, fake } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    await send("/api/settings/workflows/selection", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-t2v",
    });
    const { job } = await (
      await send("/api/jobs", acoustic, { "Idempotency-Key": "no-lora-run-1" })
    ).json();
    expect(fake.prompts[0].prompt).not.toHaveProperty("900");
    fake.state = "success";
    expect((await (await send(`/api/jobs/${job.id}`)).json()).job.status).toBe(
      "Ready",
    );
    // The session moves on: default template, Comfy Cloud.
    await send("/api/settings/workflows/selection", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-akuspace-t2v",
    });
    await send("/api/settings/run-location", { location: "cloud" });
    // Recreate: the studio's restorer, against this server with this session.
    const post = (route: string, body: unknown) =>
      fetch(`${base}${route}`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
      });
    const onError = vi.fn();
    await new RunRestorer(undefined, {
      readTake: (id) =>
        fetch(`${base}/api/takes/${id}`, { headers: { cookie } }),
      selectWorkflow: (entry, template) =>
        post("/api/settings/workflows/selection", { entry, template }),
      saveRunLocation: (location) =>
        post("/api/settings/run-location", { location }),
    }).restore(job, onError);
    expect(onError).not.toHaveBeenCalled();
    const { quote } = await (await send("/api/quotes", acoustic)).json();
    expect(quote.recipe).toMatchObject({
      workflow: "ltx-2-5-t2v",
      location: "local",
    });
    expect(quote.estimateUsd).toBe(0);
  });
});
