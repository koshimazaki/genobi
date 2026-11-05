import { afterEach, describe, expect, it } from "vitest";
import { GpuBoxes } from "../server/gpu-boxes";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { klein, png, studio } from "./run-location-harness";

// The GPU box run location end to end on the local server: a second fake
// ComfyUI stands in for the tunnel's loopback end (a Vast box or the lab
// machine). Runs go to the box's port and nowhere else, quotes are bound to
// it, and only its name and port are kept.

let box: FakeComfy | undefined;
afterEach(async () => {
  await box?.close();
  box = undefined;
});

async function withBox(without: string[] = []) {
  const nodes = nodesFor(kleinBaseWorkflow.graph);
  for (const type of without) delete nodes[type];
  box = await fakeComfy({
    nodes,
    devices: [{ name: "NVIDIA GeForce RTX 5090", vram_total: 32 * 1024 ** 3 }],
    outputs: {
      "9": {
        images: [{ filename: "Box_00001_.png", subfolder: "", type: "output" }],
      },
    },
    media: png,
  });
  const port = Number(new URL(box.url).port);
  const app = await studio([], undefined, undefined, new GpuBoxes());
  return { ...app, box, port };
}

describe("GPU box run location", () => {
  it("needs a name and port, keeps only those, and reports the box", async () => {
    const { send, store, port } = await withBox();
    const refused = await send("/api/settings/run-location", {
      location: "box",
    });
    expect(refused.status).toBe(400);
    const bad = await send("/api/settings/run-location", {
      location: "box",
      box: { name: "vast", port: 22 },
    });
    expect((await bad.json()).code).toBe("invalid_destination");
    const set = await send("/api/settings/run-location", {
      location: "box",
      box: { name: "vast", port, host: "root@203.0.113.9", key: "secret" },
    });
    const state = await set.json();
    expect(state).toMatchObject({
      location: "local",
      mode: "box",
      label: "GPU box vast",
      local: { reachable: true },
      box: {
        name: "vast",
        port,
        url: `http://127.0.0.1:${port}`,
        status: {
          reachable: true,
          gpu: "NVIDIA GeForce RTX 5090",
          vramBytes: 32 * 1024 ** 3,
          idle: false,
        },
      },
    });
    expect(state.box.status.upSince).toEqual(expect.any(String));
    // No SSH host or key is stored anywhere.
    expect(store.data.settings[0].box).toEqual({ name: "vast", port });
    expect(JSON.stringify(store.data)).not.toMatch(/203\.0\.113\.9|secret/);
  });

  it("runs on the box's port alone, bound to it by the quote", async () => {
    const { send, fake, cloudRuns, port } = await withBox();
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "lab", port },
    });
    const { quote } = await (await send("/api/quotes", klein)).json();
    expect(quote.recipe).toMatchObject({
      location: "local",
      box: { name: "lab", url: `http://127.0.0.1:${port}` },
    });
    const { job } = await (
      await send("/api/jobs", klein, {
        "Idempotency-Key": "box-klein-1",
        "Quote-Id": quote.id,
      })
    ).json();
    expect(job.status).toBe("Pending");
    expect(box!.prompts).toHaveLength(1);
    // The default local ComfyUI and Comfy Cloud got nothing.
    expect(fake.prompts).toHaveLength(0);
    expect(cloudRuns()).toBe(0);
    box!.state = "success";
    const polled = await (await send(`/api/jobs/${job.id}`)).json();
    expect(polled.job.status).toBe("Ready");
    const state = await (await send("/api/settings/run-location")).json();
    expect(state.box.status.lastJobAt).toEqual(expect.any(String));
  });

  it("never spends a box quote on another port or the default local ComfyUI", async () => {
    const { send, fake, port } = await withBox();
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "lab", port },
    });
    const { quote } = await (await send("/api/quotes", klein)).json();
    await send("/api/settings/run-location", { location: "local" });
    const spent = await send("/api/jobs", klein, {
      "Idempotency-Key": "box-switched",
      "Quote-Id": quote.id,
    });
    expect((await spent.json()).code).toBe("quote_mismatch");
    expect(box!.prompts).toHaveLength(0);
    expect(fake.prompts).toHaveLength(0);
  });

  it("checks the box, not the local ComfyUI, and refuses a missing node before sending", async () => {
    const { send, port } = await withBox(["TextGenerate"]);
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "lab", port },
    });
    const { local } = await (
      await send("/api/settings/workflows?check=local")
    ).json();
    expect(local.reachable).toBe(true);
    expect(local.templates["flux-3-klein-base-t2i"].missingNodes).toEqual([
      "TextGenerate",
    ]);
    const { job } = await (
      await send("/api/jobs", klein, { "Idempotency-Key": "box-missing" })
    ).json();
    expect(job).toMatchObject({ status: "Error", costActualUsd: 0 });
    expect(job.error).toContain("The GPU box lacks the node types");
    expect(job.error).toContain("TextGenerate");
    expect(box!.prompts).toHaveLength(0);
  });
});
