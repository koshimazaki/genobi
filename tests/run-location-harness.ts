import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { kleinWorkflow } from "../shared/comfy/klein";
import {
  kleinBaseWorkflow,
  kleinBaseEditTemplate,
} from "../shared/comfy/klein-base";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { input, setup } from "./server-harness";
import type { ServerKeys } from "../server/keys";

// The local server with a fake ComfyUI behind its Local location and a
// stand-in Comfy Cloud: the run location tests' studio, and a restart of it.
export const png = await readFile(
  path.join(import.meta.dirname, "fixtures/reference.png"),
);
export const klein = {
  generator: "image",
  model: "flux-3-klein",
  description: "A kite festival on a windy beach.",
  imageAspectRatio: "1:1",
  imageResolution: "1k",
};
export const acoustic = {
  ...input,
  model: "ltx-2.5-akuspace",
  duration: 6,
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
};

let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

const unet = "flux3/klein-base-local.safetensors";
const distilledUnet = "flux3/klein-distilled-local.safetensors";

/**
 * `keys` replaces the BFL environment key; `reopen` starts the studio again
 * on an earlier one's store and ComfyUI, as a restart of the server does.
 */
export async function studio(
  without: string[] = [],
  keys?: ServerKeys,
  reopen?: { fake: FakeComfy; directory: string },
) {
  const nodes = nodesFor(kleinBaseWorkflow.graph);
  // The same ComfyUI provides Base editing (reference and image-aware nodes).
  for (const [type, inputs] of Object.entries(
    nodesFor(kleinBaseEditTemplate(1).graph),
  )) {
    nodes[type] ??= {};
    for (const [name, values] of Object.entries(inputs))
      nodes[type][name] = [
        ...new Set([...(nodes[type][name] ?? []), ...values]),
      ];
  }
  // Base is the new default, Distilled remains explicitly selectable for
  // earlier takes. Their diffusion weights are never interchangeable.
  nodes.UNETLoader.unet_name = [unet, distilledUnet];
  for (const type of without) delete nodes[type];
  fake =
    reopen?.fake ??
    (await fakeComfy({
      nodes,
      outputs: {
        "9": {
          images: [
            { filename: "Klein_00001_.png", subfolder: "", type: "output" },
          ],
        },
      },
      media: png,
    }));
  let cloudRuns = 0;
  const cloud: WorkflowClient = {
    run: async () => {
      cloudRuns++;
      return "https://cloud.comfy.org/api/v2/jobs/cloud-1";
    },
    poll: async () => ({ id: "cloud-1", status: "Generating" }),
    download: async () => new Response(),
  };
  const local = new LocalComfyWorkflows({
    url: fake.url,
    models: {
      [kleinBaseWorkflow.id]: { unet_name: unet },
      [kleinWorkflow.id]: { unet_name: distilledUnet },
    },
  });
  const app = await setup(
    undefined,
    new WorkflowDestinations(cloud, local),
    { destination: { kind: "cloud" }, local },
    keys,
    reopen?.directory,
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
  return { ...app, fake, send, cloudRuns: () => cloudRuns };
}
