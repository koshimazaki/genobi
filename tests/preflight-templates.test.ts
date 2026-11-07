import { afterEach, describe, expect, it } from "vitest";
import { ComfySdkWorkflows, type Connect } from "../server/comfy-sdk";
import { GpuBoxes } from "../server/gpu-boxes";
import { blocks, preflightGraph } from "../shared/comfy/preflight";
import { workflowTemplates } from "../shared/comfy/workflows";
import type { ObjectInfo } from "../shared/comfy/readiness";
import type { WorkflowTemplate } from "../shared/comfy/workflow";
import { infoFor } from "./comfy-readiness-fixture";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";

// The generalised pre-submit check (#47): every template's filled graph is
// checked against the target's own /object_info, and a missing node or model
// is refused before anything is uploaded or submitted, on Comfy Cloud and on
// a loopback ComfyUI (local or a GPU box). Several templates, not only Klein.

const byId = (id: string) =>
  workflowTemplates.find((choice) => choice.id === id)!.template;
const TEMPLATES = [
  "ltx-2-5-akuspace-t2v",
  "ltx-2-5-t2v",
  "minimax-h3-rgb",
  "minimax-h3-canny",
  "minimax-h3-depth",
  "minimax-h3-combined",
  "seedvr2-upscale",
  "minimax-music-3",
].map(byId);

/** A model slot's loader node and input, from its `node.input` path. */
function modelSlot(template: WorkflowTemplate) {
  const [name, slot] = Object.entries(template.slots).find(
    ([, s]) => s.kind === "model",
  )!;
  const dot = slot.path.indexOf(".");
  const node = template.graph[slot.path.slice(0, dot)];
  return { name, type: node.class_type, input: slot.path.slice(dot + 1) };
}

/** A node class only this template uses among the core loaders. */
const someNode = (template: WorkflowTemplate) =>
  Object.values(template.graph)
    .map((node) => node.class_type)
    .find((type) => !/Loader|Save|Preview/.test(type))!;

function without(info: ObjectInfo, type: string) {
  const copy = structuredClone(info);
  delete copy[type];
  return copy;
}
function lacking(info: ObjectInfo, type: string, input: string) {
  const copy = structuredClone(info);
  copy[type]!.input!.required![input] = [["something-else.safetensors"]];
  return copy;
}

describe("the pre-submit check, by template", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: passes a complete catalogue and names a missing node or model",
    (_id, template) => {
      const info = infoFor(template.graph);
      expect(blocks(preflightGraph(template, template.graph, info))).toBe(
        false,
      );
      const node = someNode(template);
      expect(
        preflightGraph(template, template.graph, without(info, node))
          .missingNodes,
      ).toContain(node);
      const slot = modelSlot(template);
      const check = preflightGraph(
        template,
        template.graph,
        lacking(info, slot.type, slot.input),
      );
      expect(check.missingModels).toContain(slot.name);
      // A slot name, never the file name or a path.
      expect(JSON.stringify(check)).not.toMatch(/\.safetensors/);
    },
  );

  it("checks a model file pinned in the graph without a slot", () => {
    const template: WorkflowTemplate = {
      id: "pinned",
      graph: {
        "1": {
          class_type: "UpscaleModelLoader",
          inputs: { model_name: "4x-pinned.safetensors" },
        },
      },
      slots: {},
    } as unknown as WorkflowTemplate;
    const info = infoFor(template.graph);
    expect(blocks(preflightGraph(template, template.graph, info))).toBe(false);
    expect(
      preflightGraph(
        template,
        template.graph,
        lacking(info, "UpscaleModelLoader", "model_name"),
      ).missingModels,
    ).toEqual(["UpscaleModelLoader.model_name"]);
  });
});

describe("Comfy Cloud refuses before submitting", () => {
  function cloud(info: ObjectInfo) {
    let submits = 0;
    const requests: string[] = [];
    const connect: Connect = () => ({
      workflows: { fromJson: (graph) => graph },
      async submit() {
        submits++;
        return { id: "job-1" };
      },
      jobs: {
        async get() {
          throw new Error("not polled");
        },
      },
    });
    const fetcher: typeof fetch = async (url) => {
      requests.push(String(url));
      return Response.json(info);
    };
    return {
      client: new ComfySdkWorkflows({ connect, fetcher, env: {} }),
      submits: () => submits,
      requests,
    };
  }
  const key = "comfyui-preflight-test";

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: a missing node or model sends nothing, a complete account submits once",
    async (_id, template) => {
      const info = infoFor(template.graph);
      const node = someNode(template);
      const gone = cloud(without(info, node));
      await expect(
        gone.client.run(template, {}, key, { idempotencyKey: "p-1" }),
      ).rejects.toMatchObject({
        code: "workflow_unsent",
        message: expect.stringContaining(node),
      });
      expect(gone.submits()).toBe(0);
      expect(gone.requests).toEqual([
        "https://cloud.comfy.org/api/object_info",
      ]);
      const slot = modelSlot(template);
      const model = cloud(lacking(info, slot.type, slot.input));
      await expect(
        model.client.run(template, {}, key, { idempotencyKey: "p-2" }),
      ).rejects.toMatchObject({
        code: "workflow_unsent",
        message: expect.stringContaining(
          `does not list the model file for ${slot.name}`,
        ),
      });
      expect(model.submits()).toBe(0);
      const ready = cloud(info);
      await ready.client.run(template, {}, key, { idempotencyKey: "p-3" });
      expect(ready.submits()).toBe(1);
    },
  );

  it("goes ahead, unchecked, when the catalogue cannot be read (unknown is not missing)", async () => {
    let submits = 0;
    const client = new ComfySdkWorkflows({
      connect: () => ({
        workflows: { fromJson: (graph) => graph },
        async submit() {
          submits++;
          return { id: "job-1" };
        },
        jobs: { get: async () => ({}) as never },
      }),
      fetcher: async () => new Response("down", { status: 503 }),
      env: {},
    });
    await client.run(byId("seedvr2-upscale"), {}, key, {
      idempotencyKey: "p-unknown",
    });
    expect(submits).toBe(1);
  });
});

describe("a GPU box refuses before submitting", () => {
  let fake: FakeComfy | undefined;
  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s: missing node or model on the box sends no prompt",
    async (_id, template) => {
      const nodes = nodesFor(template.graph);
      const node = someNode(template);
      delete nodes[node];
      fake = await fakeComfy({ nodes });
      const box = new GpuBoxes().client(fake.url)!;
      await expect(
        box.run(template, {}, "", { idempotencyKey: "box-1" }),
      ).rejects.toMatchObject({
        code: "workflow_unsent",
        message: expect.stringMatching(
          new RegExp(`^The GPU box lacks the node types .*${node}`),
        ),
      });
      expect(fake.prompts).toHaveLength(0);
      await fake.close();
      const slot = modelSlot(template);
      const all = nodesFor(template.graph);
      all[slot.type][slot.input] = ["other.safetensors"];
      fake = await fakeComfy({ nodes: all });
      await expect(
        new GpuBoxes()
          .client(fake.url)!
          .run(template, {}, "", { idempotencyKey: "box-2" }),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          `The GPU box does not list the model file for ${slot.name}`,
        ),
      });
      expect(fake.prompts).toHaveLength(0);
    },
  );
});
