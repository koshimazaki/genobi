import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { ServerKeys } from "../server/keys";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { ltxWorkflow } from "../shared/comfy/akuspace";
import { seedvr2Workflow } from "../shared/comfy/seedvr2";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { GenerateInput } from "../shared/types";
import { chainClient, chainController } from "../src/chain-client";
import {
  chainsReducer,
  emptyChains,
  type ChainsState,
} from "../src/chain-state";
import { useSettingsStore } from "../src/settings-store";
import { priceableNow } from "../src/useChains";
import type { RunLocationState } from "../shared/comfy/run-location";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { input, setup } from "./server-harness";

// A chain whose stages all run on the local ComfyUI needs no key: it is
// created, its first stage runs, its pause is priced and approved, and the
// second stage reaches the local ComfyUI, all with no key sent or held. A
// stage that runs anywhere else still asks for one.
const clip = path.resolve("tests/fixtures/metadata.mp4");
const ltxOpen = { ...input, model: "ltx-2.5-open", duration: 6 };
const seedvr2 = { ...input, generator: "upscale", model: "seedvr2-upscale" };
const fluxUpscale = { ...input, generator: "upscale" };

let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
  useSettingsStore.setState({ runLocation: undefined });
});

/** What the page shows as applied, as the Local tick or setup writes it. */
const showLocation = (location: "local" | "cloud") =>
  useSettingsStore.setState({
    runLocation: { location, fixed: false } as RunLocationState,
  });

function nodes() {
  const merged: Record<string, Record<string, unknown[]>> = {};
  for (const graph of [ltxWorkflow.graph, seedvr2Workflow.graph])
    for (const [type, inputs] of Object.entries(nodesFor(graph))) {
      merged[type] ??= {};
      for (const [name, list] of Object.entries(inputs))
        merged[type][name] = [...(merged[type][name] ?? []), ...list];
    }
  return merged;
}

async function keylessStudio() {
  fake = await fakeComfy({
    nodes: nodes(),
    outputs: {
      "75": {
        images: [{ filename: "LTX_00001_.mp4", subfolder: "", type: "output" }],
      },
    },
    media: new Uint8Array(await readFile(clip)),
  });
  let cloudRuns = 0;
  const cloud: WorkflowClient = {
    run: async () => {
      cloudRuns++;
      return "https://cloud.comfy.org/api/v2/jobs/cloud-1";
    },
    poll: async () => ({ id: "cloud-1", status: "Generating" }),
    download: async () => new Response(),
  };
  const local = new LocalComfyWorkflows({ url: fake.url });
  const app = await setup(
    undefined,
    new WorkflowDestinations(cloud, local),
    { destination: { kind: "cloud" }, local },
    new ServerKeys({}),
  );
  const send = (route: string, body?: unknown, headers = {}) =>
    fetch(`${app.base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  await send("/api/settings/run-location", { location: "local" });
  /** Runs a stage's job to Ready on the fake, polled with no key. */
  const finish = async (jobId: string) => {
    fake!.state = "success";
    const { job } = await (await send(`/api/jobs/${jobId}`)).json();
    return job;
  };
  return { ...app, fake: fake!, send, finish, cloudRuns: () => cloudRuns };
}

describe("a chain on the local ComfyUI with no key", () => {
  it("is created, paused, approved and sent to the local ComfyUI throughout", async () => {
    const { send, finish, fake, cloudRuns } = await keylessStudio();
    const created = await send("/api/chains", {
      stages: [{ input: ltxOpen }, { input: seedvr2, consumes: 0 }],
    });
    expect(created.status).toBe(201);
    let { chain } = await created.json();
    expect(chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(chain.quote.estimateUsd).toBe(0);

    const one = await send(
      `/api/chains/${chain.id}/approve`,
      {},
      { "Quote-Id": chain.quote.id },
    );
    expect(one.status).toBe(202);
    ({ chain } = await one.json());
    expect(fake.prompts).toHaveLength(1);
    expect(await finish(chain.stages[0].jobId)).toMatchObject({
      status: "Ready",
    });

    // The pause is priced on its first read, keyless: stage 2 is local too.
    const read = await (await send(`/api/chains/${chain.id}`)).json();
    expect(read.needsKey).toBeUndefined();
    expect(read.chain).toMatchObject({ status: "paused", pausedAt: 1 });
    expect(read.chain.quote.estimateUsd).toBe(0);
    const two = await send(
      `/api/chains/${chain.id}/approve`,
      {},
      { "Quote-Id": read.chain.quote.id },
    );
    expect(two.status).toBe(202);
    expect(fake.prompts).toHaveLength(2);
    expect(cloudRuns()).toBe(0);
  });

  it("still asks for a key at a pause whose stage runs off the local ComfyUI", async () => {
    const { send, finish, fake } = await keylessStudio();
    const { chain } = await (
      await send("/api/chains", {
        stages: [{ input: ltxOpen }, { input: fluxUpscale, consumes: 0 }],
      })
    ).json();
    const one = await send(
      `/api/chains/${chain.id}/approve`,
      {},
      { "Quote-Id": chain.quote.id },
    );
    const { chain: running } = await one.json();
    await finish(running.stages[0].jobId);
    const read = await (await send(`/api/chains/${chain.id}`)).json();
    expect(read.needsKey).toBe(true);
    expect(read.chain.quote).toBeUndefined();
    expect(fake.prompts).toHaveLength(1);
  });

  it("refuses to create a chain whose first stage needs a key", async () => {
    const { send, fake } = await keylessStudio();
    const created = await send("/api/chains", {
      stages: [{ input: { ...input, model: "ltx-2.5" } }],
    });
    expect(created.status).toBe(400);
    expect((await created.json()).code).toBe("invalid_key");
    expect(fake.prompts).toHaveLength(0);
  });
});

describe("the page's chain gate", () => {
  it("asks canSend about the stage it would send", async () => {
    const asked: (GenerateInput | undefined)[] = [];
    const controller = chainController({
      client: chainClient(
        async () => Response.json({ error: "unused" }, { status: 500 }),
        () => "",
      ),
      dispatch: () => {},
      canSend: (stage) => {
        asked.push(stage);
        return false;
      },
      schedule: () => () => {},
    });
    const body = { stages: [{ input: ltxOpen as unknown as GenerateInput }] };
    await expect(controller.start(body, { origin: "fast" })).rejects.toThrow(
      /Connect your key/,
    );
    expect(asked).toEqual([ltxOpen]);
  });
});

describe("a pause that asked for a key on Cloud", () => {
  it("is priced keyless once the studio switches to Local, with no key change", async () => {
    const { base, cookie, send, finish } = await keylessStudio();
    const { chain } = await (
      await send("/api/chains", {
        stages: [{ input: ltxOpen }, { input: seedvr2, consumes: 0 }],
      })
    ).json();
    const one = await send(
      `/api/chains/${chain.id}/approve`,
      {},
      { "Quote-Id": chain.quote.id },
    );
    await finish((await one.json()).chain.stages[0].jobId);
    let state: ChainsState = emptyChains;
    const controller = chainController({
      client: chainClient(
        (route, init) =>
          fetch(`${base}${route}`, {
            ...init,
            headers: { ...(init?.headers as object), cookie },
          }),
        () => "",
      ),
      dispatch: (action) => {
        state = chainsReducer(state, action);
      },
      canSend: () => false,
      schedule: () => () => {},
    });
    // On Cloud with no key, the pause asks for one and nothing re-reads it.
    await send("/api/settings/run-location", { location: "cloud" });
    showLocation("cloud");
    await controller.read(chain.id);
    expect(state.entries[chain.id].needsKey).toBe(true);
    expect(priceableNow(state, false)).toEqual([]);
    // Switching to Local alone makes it priceable; the re-read prices it.
    await send("/api/settings/run-location", { location: "local" });
    showLocation("local");
    expect(priceableNow(state, false)).toEqual([chain.id]);
    await controller.read(chain.id);
    const entry = state.entries[chain.id];
    expect(entry.needsKey).toBe(false);
    expect(entry.chain.quote?.estimateUsd).toBe(0);
  });
});
