import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { ServerKeys } from "../server/keys";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { kleinWorkflow } from "../shared/comfy/klein";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import { seedvr2Workflow } from "../shared/comfy/seedvr2";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { klein } from "./run-location-harness";
import { input, setup } from "./server-harness";

// A workflow run on the local ComfyUI needs no provider key: with none sent
// or held it is quoted at $0 and reaches the local client once. A Comfy
// Cloud plan still needs the Comfy key, and uses it when it is there.
const COMFY = "comfyui-test-key-0099";
const clip = path.resolve("tests/fixtures/metadata.mp4");

let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

/** Both graphs' node types and files, merged, as one ComfyUI lists them. */
function nodes() {
  const merged: Record<string, Record<string, unknown[]>> = {};
  for (const graph of [
    kleinBaseWorkflow.graph,
    kleinWorkflow.graph,
    seedvr2Workflow.graph,
  ])
    for (const [type, inputs] of Object.entries(nodesFor(graph))) {
      merged[type] ??= {};
      for (const [name, list] of Object.entries(inputs))
        merged[type][name] = [...(merged[type][name] ?? []), ...list];
    }
  return merged;
}

async function keyless(keys = new ServerKeys({})) {
  fake = await fakeComfy({ nodes: nodes() });
  let cloudRuns = 0;
  const cloudKeys: string[] = [];
  const cloud: WorkflowClient = {
    run: async (_template, _values, key) => {
      cloudRuns++;
      cloudKeys.push(key);
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
    keys,
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
  const uploaded = await fetch(`${app.base}/api/uploads?filename=up.mp4`, {
    method: "POST",
    headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
    body: new Uint8Array(await readFile(clip)),
  });
  const { source } = await uploaded.json();
  const seedvr2 = {
    ...input,
    generator: "upscale",
    model: "seedvr2-upscale",
    sourceId: source.id,
  };
  return {
    ...app,
    fake: fake!,
    send,
    seedvr2,
    cloudRuns: () => cloudRuns,
    cloudKeys,
  };
}

describe("a local workflow run with no key anywhere", () => {
  it.each([
    ["SeedVR2", "seedvr2"],
    ["Klein", "klein"],
  ] as const)(
    "%s: quoted at zero and sent once to the local ComfyUI",
    async (_name, which) => {
      const studio = await keyless();
      const body = which === "klein" ? klein : studio.seedvr2;
      await studio.send("/api/settings/run-location", { location: "local" });
      const quoted = await studio.send("/api/quotes", body);
      expect(quoted.status).toBe(201);
      const { quote } = await quoted.json();
      expect(quote.estimateUsd).toBe(0);
      expect(quote.recipe.location).toBe("local");
      expect(studio.fake.prompts).toHaveLength(0);
      const response = await studio.send("/api/jobs", body, {
        "Idempotency-Key": `keyless-${which}`,
        "Quote-Id": quote.id,
      });
      expect(response.status).toBe(202);
      const { job } = await response.json();
      expect(job).toMatchObject({ status: "Pending", costEstimateUsd: 0 });
      expect(studio.fake.prompts).toHaveLength(1);
      // A replay sends nothing again; Cloud is never reached.
      await studio.send("/api/jobs", body, {
        "Idempotency-Key": `keyless-${which}`,
      });
      expect(studio.fake.prompts).toHaveLength(1);
      expect(studio.cloudRuns()).toBe(0);
    },
  );

  it("refuses a Comfy Cloud plan with no key, before anything is sent", async () => {
    const studio = await keyless();
    for (const body of [studio.seedvr2, klein]) {
      const quoted = await studio.send("/api/quotes", body);
      expect(quoted.status).toBe(400);
      expect((await quoted.json()).code).toBe("invalid_key");
      const sent = await studio.send("/api/jobs", body, {
        "Idempotency-Key": crypto.randomUUID(),
      });
      expect(sent.status).toBe(400);
    }
    expect(studio.cloudRuns()).toBe(0);
    expect(studio.fake.prompts).toHaveLength(0);
  });

  it("sends a Comfy Cloud run with the held Comfy key, as before", async () => {
    const studio = await keyless(new ServerKeys({ comfy: COMFY }));
    const response = await studio.send("/api/jobs", studio.seedvr2, {
      "Idempotency-Key": "cloud-keyed",
    });
    expect(response.status).toBe(202);
    expect((await response.json()).job.keyMode).toBe("server");
    expect(studio.cloudKeys).toEqual([COMFY]);
    expect(studio.fake.prompts).toHaveLength(0);
  });
});
