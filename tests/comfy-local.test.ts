import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { kleinValues, kleinWorkflow } from "../shared/comfy/klein";
import {
  isUnsent,
  NotYetWorkflow,
  type WorkflowTemplate,
} from "../shared/comfy/workflow";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";

const png = await readFile(
  path.join(import.meta.dirname, "fixtures/reference.png"),
);
const JOB = "0f6c3c34-6a43-4e62-9c3b-2f9a1d2e7b11";
const values = kleinValues(
  { imageAspectRatio: "1:1", imageResolution: "1k" },
  "A kite.",
  () => 0.5,
);
const imageOutput = {
  "9": {
    images: [{ filename: "Klein_00001_.png", subfolder: "", type: "output" }],
  },
};

let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});
async function start(nodes = nodesFor(kleinWorkflow.graph)) {
  fake = await fakeComfy({ nodes, outputs: imageOutput, media: png });
  return { fake, client: new LocalComfyWorkflows({ url: fake.url }) };
}
const sent = (f: FakeComfy, route: string) =>
  f.requests.filter((r) => r.path === route).length;
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error("Expected a refusal");
};

describe("the local ComfyUI client", () => {
  it("accepts only a loopback http address", () => {
    for (const url of [
      "https://127.0.0.1:8188",
      "http://192.168.1.4:8188",
      "http://comfy.example",
    ])
      expect(() => new LocalComfyWorkflows({ url })).toThrow(
        /local destination/,
      );
    expect(new LocalComfyWorkflows().base).toBe("http://127.0.0.1:8188");
  });

  it("detects a running ComfyUI without passing on its paths", async () => {
    const { client } = await start();
    const status = await client.status();
    expect(status).toEqual({ reachable: true, version: "0.3.99" });
    expect(JSON.stringify(status)).not.toContain("someone");
    await fake!.close();
    fake = undefined;
    expect(await client.status()).toEqual({ reachable: false, version: null });
  });

  it("submits once, polls the queue then history, and fetches the output through /view", async () => {
    const { fake, client } = await start();
    const handle = await client.run(
      kleinWorkflow,
      values,
      "comfyui-never-sent",
      { idempotencyKey: JOB },
    );
    expect(handle).toBe(`${fake.url}/history/${JOB}`);
    expect(fake.prompts).toHaveLength(1);
    const [prompt] = fake.prompts;
    expect(prompt.prompt_id).toBe(JOB);
    expect(prompt.prompt["18:17"].inputs.value).toBe(values.prompt);
    // No key travels to the local ComfyUI.
    expect(
      fake.requests.some((r) =>
        r.body.toString().includes("comfyui-never-sent"),
      ),
    ).toBe(false);
    expect(await client.poll(handle, "", kleinWorkflow.output)).toEqual({
      id: JOB,
      status: "Pending",
    });
    fake.state = "running";
    expect((await client.poll(handle, "", kleinWorkflow.output)).status).toBe(
      "Generating",
    );
    fake.state = "success";
    const ready = await client.poll(handle, "", kleinWorkflow.output);
    expect(ready.status).toBe("Ready");
    expect(ready.result?.sample).toBe(
      `${fake.url}/view?filename=Klein_00001_.png&subfolder=&type=output`,
    );
    const media = await client.download(ready.result!.sample!);
    expect(new Uint8Array(await media.arrayBuffer())).toEqual(
      new Uint8Array(png),
    );
    expect(sent(fake, "/prompt")).toBe(1);
  });

  it("reads a failed run and a forgotten one", async () => {
    const { fake, client } = await start();
    const handle = await client.run(kleinWorkflow, values, "", {
      idempotencyKey: JOB,
    });
    fake.state = "error";
    expect((await client.poll(handle, "")).status).toBe("Error");
    fake.state = "gone";
    expect((await client.poll(handle, "")).status).toBe("Task not found");
  });

  it("refuses a handle or a media URL that names another address", async () => {
    const { fake, client } = await start();
    for (const handle of [
      "http://127.0.0.1:9/history/abc",
      `${fake.url}/history/abc?x=1`,
      "https://cloud.comfy.org/api/v2/jobs/abc",
    ])
      await expect(client.poll(handle, "")).rejects.toThrow(
        /unsupported delivery/,
      );
    for (const url of [
      `${fake.url}/view?filename=../secret&subfolder=&type=output`,
      `${fake.url}/view?filename=a.png&subfolder=&type=input`,
      `${fake.url}/upload/image`,
      "https://example.com/view?filename=a.png&subfolder=&type=output",
    ])
      await expect(client.download(url)).rejects.toThrow(
        /unsupported delivery/,
      );
    expect(sent(fake, "/view")).toBe(0);
  });

  it("calls a lost answer unconfirmed and never sends it again", async () => {
    const { fake, client } = await start();
    fake.answer = "lose";
    const error = await failure(
      client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    );
    expect(error.code).toBe("submission_unknown");
    expect(isUnsent(error)).toBe(false);
    fake.answer = "server_error";
    expect(
      (
        await failure(
          client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
        )
      ).code,
    ).toBe("submission_unknown");
    expect(sent(fake, "/prompt")).toBe(2);
  });

  it("names the node of a refusal, never ComfyUI's text or a path", async () => {
    const { fake, client } = await start();
    fake.answer = "node_error";
    const error = await failure(
      client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    );
    expect(error.code).toBe("workflow_rejected");
    expect(error.message).toBe(
      "The local ComfyUI refused this workflow at UNETLoader.",
    );
    expect(error.message).not.toMatch(/someone|safetensors|Value not in list/);
  });

  it("refuses before submission when node types are missing, naming them", async () => {
    const nodes = nodesFor(kleinWorkflow.graph);
    delete nodes.TextGenerate;
    delete nodes.ComfySwitchNode;
    const { fake, client } = await start(nodes);
    const error = await failure(
      client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    );
    expect(isUnsent(error)).toBe(true);
    expect(error.message).toContain("ComfySwitchNode, TextGenerate");
    expect(sent(fake, "/prompt")).toBe(0);
  });

  it("refuses before submission when a model file is not listed, naming the slot only", async () => {
    const nodes = nodesFor(kleinWorkflow.graph);
    nodes.UNETLoader.unet_name = ["something-else.safetensors"];
    const { fake, client } = await start(nodes);
    const error = await failure(
      client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    );
    expect(isUnsent(error)).toBe(true);
    expect(error.message).toContain("unet_name");
    expect(error.message).not.toContain(".safetensors");
    expect(sent(fake, "/prompt")).toBe(0);
  });

  it("fills model slots from the local model map", async () => {
    const file = "flux3/klein-local.safetensors";
    const nodes = nodesFor(kleinWorkflow.graph);
    nodes.UNETLoader.unet_name = [file];
    fake = await fakeComfy({ nodes });
    const client = new LocalComfyWorkflows({
      url: fake.url,
      models: { [kleinWorkflow.id]: { unet_name: file } },
    });
    await client.run(kleinWorkflow, values, "", { idempotencyKey: JOB });
    expect(fake.prompts[0].prompt["18:1"].inputs.unet_name).toBe(file);
  });

  it("refuses unsent when no ComfyUI answers", async () => {
    const { fake, client } = await start();
    await fake.close();
    const error = await failure(
      client.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    );
    expect(isUnsent(error)).toBe(true);
    expect(error.message).toMatch(/No local ComfyUI answered/);
  });

  it("uploads an input file for an image slot and names it in the graph", async () => {
    const template: WorkflowTemplate = {
      id: "test-i2i",
      file: "workflows/test-i2i.json",
      graph: {
        "1": { class_type: "LoadImage", inputs: { image: "example.png" } },
        "2": {
          class_type: "SaveImage",
          inputs: { images: ["1", 0], filename_prefix: "t" },
        },
      },
      slots: { first_frame: { path: "1.image", kind: "image" } },
      requiredNodes: [],
      requiredModels: [],
      output: { nodeId: "2", media: "image" },
    };
    fake = await fakeComfy({ nodes: { LoadImage: {}, SaveImage: {} } });
    const client = new LocalComfyWorkflows({ url: fake.url });
    await client.run(template, {}, "", {
      idempotencyKey: JOB,
      files: {
        first_frame: { bytes: new Uint8Array(png), contentType: "image/png" },
      },
    });
    const upload = fake.requests.find((r) => r.path === "/upload/image")!;
    expect(upload.body.includes(Buffer.from(png))).toBe(true);
    expect(upload.body.toString("latin1")).toContain('name="type"');
    expect(fake.prompts[0].prompt["1"].inputs.image).toBe(
      `genobi/genobi-${JOB}-first_frame.png`,
    );
    // A file for a slot the template does not have is refused unsent.
    const error = await failure(
      client.run(template, {}, "", {
        idempotencyKey: JOB,
        files: {
          other: { bytes: new Uint8Array(png), contentType: "image/png" },
        },
      }),
    );
    expect(isUnsent(error)).toBe(true);
    expect(fake.prompts).toHaveLength(1);
  });

  it("routes a run by location and a poll by the handle's address", async () => {
    const { fake, client } = await start();
    const runs = new WorkflowDestinations(new NotYetWorkflow(), client);
    const handle = await runs.run(kleinWorkflow, values, "", {
      idempotencyKey: JOB,
      location: "local",
    });
    expect(handle.startsWith(fake.url)).toBe(true);
    expect((await runs.poll(handle, "")).status).toBe("Pending");
    // Cloud and a deployment never reach the local ComfyUI.
    await expect(
      runs.run(kleinWorkflow, values, "", { idempotencyKey: JOB }),
    ).rejects.toMatchObject({
      code: "cloud_unavailable",
    });
    await expect(
      runs.run(kleinWorkflow, values, "", {
        idempotencyKey: JOB,
        location: "deployment",
      }),
    ).rejects.toMatchObject({ code: "workflow_not_configured" });
    expect(fake.prompts).toHaveLength(1);
  });
});
