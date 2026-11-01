import { describe, expect, it } from "vitest";
import { ComfySdkWorkflows, type Connect } from "../server/comfy-sdk";
import { kleinValues, kleinWorkflow } from "../shared/comfy/klein";
import type { ApiGraph } from "../shared/comfy/slots";
import { infoFor } from "./comfy-readiness-fixture";

const OFFICIAL = "flux3-image-klein-int8-convrot.safetensors";
const LEGACY = "flux3_image_klein_sd_int8_convrot.safetensors";
const values = kleinValues({ imageAspectRatio: "1:1" }, "A paper kite.", () => 0);

function cloud(models: string[], status = 200) {
  const info = infoFor(kleinWorkflow.graph);
  const unet = info.UNETLoader?.input?.required;
  if (!unet) throw new Error("UNETLoader fixture has no choices");
  unet.unet_name = [models];
  const requests: { url: string; method?: string }[] = [];
  const graphs: ApiGraph[] = [];
  const connect: Connect = () => ({
    workflows: { fromJson: (graph) => graph },
    async submit(graph) {
      graphs.push(graph as ApiGraph);
      return { id: "klein-first-job" };
    },
    jobs: {
      async get() {
        return {
          id: "klein-first-job",
          status: "queued",
          progress: null,
          outputs: [],
        };
      },
    },
  });
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method });
    return Response.json(status === 200 ? info : { error: "unavailable" }, {
      status,
    });
  };
  return {
    requests,
    graphs,
    client: new ComfySdkWorkflows({ connect, fetcher, env: {} }),
  };
}

describe("Klein Cloud model preflight", () => {
  it("submits the official loader filename when the current account lists it", async () => {
    const { client, requests, graphs } = cloud([OFFICIAL, LEGACY]);
    await client.run(kleinWorkflow, values, "comfyui-cloud-test", {
      idempotencyKey: "klein-preflight-official",
    });
    expect(requests).toEqual([
      { url: "https://cloud.comfy.org/api/object_info", method: "GET" },
    ]);
    expect(graphs).toHaveLength(1);
    expect(graphs[0]["18:1"].inputs.unet_name).toBe(OFFICIAL);
    expect(kleinWorkflow.graph["18:1"].inputs.unet_name).toBe(OFFICIAL);
  });

  it("selects the recorded legacy Cloud alias only when the account lists it", async () => {
    const { client, graphs } = cloud([LEGACY]);
    await client.run(kleinWorkflow, values, "comfyui-cloud-test", {
      idempotencyKey: "klein-preflight-legacy",
    });
    expect(graphs).toHaveLength(1);
    expect(graphs[0]["18:1"].inputs.unet_name).toBe(LEGACY);
    expect(kleinWorkflow.graph["18:1"].inputs.unet_name).toBe(OFFICIAL);
  });

  it("does not submit or charge a Klein run when the account lacks the model", async () => {
    const { client, requests, graphs } = cloud(["different-model.safetensors"]);
    await expect(
      client.run(kleinWorkflow, values, "comfyui-cloud-test", {
        idempotencyKey: "klein-preflight-missing",
      }),
    ).rejects.toMatchObject({
      code: "workflow_unsent",
      message: expect.stringContaining("Nothing was sent or charged"),
    });
    expect(requests).toHaveLength(1);
    expect(graphs).toHaveLength(0);
  });

  it("stops before a GPU request if the Cloud inventory cannot be read", async () => {
    const { client, requests, graphs } = cloud([OFFICIAL], 401);
    await expect(
      client.run(kleinWorkflow, values, "comfyui-cloud-test", {
        idempotencyKey: "klein-preflight-unavailable",
      }),
    ).rejects.toMatchObject({ code: "workflow_unsent" });
    expect(requests).toHaveLength(1);
    expect(graphs).toHaveLength(0);
  });
});
