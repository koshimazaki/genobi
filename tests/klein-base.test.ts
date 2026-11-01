import { describe, expect, it, vi } from "vitest";
import type { GenerateInput } from "../shared/types";
import { kleinWorkflow } from "../shared/comfy/klein";
import {
  kleinBaseWorkflow,
  kleinBaseEditTemplate,
  kleinBaseEditValues,
} from "../shared/comfy/klein-base";
import { workflowRun } from "../shared/comfy/runs";
import { danglingLinks, fillSlots } from "../shared/comfy/slots";
import { infoFor } from "./comfy-readiness-fixture";
import { ComfySdkWorkflows, type Connect } from "../server/comfy-sdk";

const baseModel = "flux3-image-klein-base-int8-convrot.safetensors";
const distilledModel = "flux3-image-klein-int8-convrot.safetensors";

describe("supplied FLUX 3 Klein Base Comfy workflows", () => {
  it("keeps Base and Distilled separate, with their own T2I samplers", () => {
    expect(kleinBaseWorkflow.graph["18:1"].inputs.unet_name).toBe(baseModel);
    expect(kleinBaseWorkflow.graph["18:7"].inputs).toMatchObject({
      steps: 50,
      cfg: 3.5,
      sampler_name: "euler",
      scheduler: "simple",
    });
    expect(kleinWorkflow.graph["18:1"].inputs.unet_name).toBe(distilledModel);
    expect(kleinWorkflow.graph["18:7"].inputs).toMatchObject({
      steps: 16,
      cfg: 1,
    });
    expect(danglingLinks(kleinBaseWorkflow.graph)).toEqual([]);
  });

  it("builds Base edits with the supplied vision-aware prompt path", () => {
    const template = kleinBaseEditTemplate(2);
    const graph = template.graph;
    expect(graph["59"].inputs.unet_name).toBe(baseModel);
    expect(graph["7"].inputs).toMatchObject({ steps: 50, cfg: 1 });
    expect(graph["47"].inputs.image).toEqual(["50", 0]);
    expect(graph["47"].inputs.prompt).toEqual(["edit-prompt", 0]);
    expect(graph["51"].inputs.on_false).toEqual(["47", 0]);
    expect(graph["51"].inputs.on_true).toEqual(["edit-prompt", 0]);
    expect(graph["17"].inputs["images.image1"]).toEqual(["reference-1", 0]);
    expect(graph["50"].inputs["images.image1"]).toEqual(["reference-1", 0]);
    expect(danglingLinks(graph)).toEqual([]);
    const values = kleinBaseEditValues(
      { imageResolution: "1k", imageReferences: ["ref"] } as GenerateInput,
      "Change the coat to blue.",
    );
    expect(values.bypassUpsample).toBe(false);
    const filled = fillSlots(template.graph, template.slots, values);
    expect(filled["edit-prompt"].inputs.value).toBe("Change the coat to blue.");
  });

  it("selects supplied Base by default and preserves Distilled as alternate", () => {
    const input = {
      generator: "image",
      model: "flux-3-klein",
      imageResolution: "1k",
    } as GenerateInput;
    const plain = workflowRun(
      "workflow/flux-3-klein-base-t2i",
      input,
      "A paper kite.",
    );
    expect(plain.template).toBe(kleinBaseWorkflow);
    const edited = workflowRun(
      "workflow/flux-3-klein-base-t2i",
      { ...input, imageReferences: ["first"] },
      "Recolor the kite.",
    );
    expect(edited.template.id).toBe("flux-3-klein-base-edit");
    const earlier = workflowRun(
      "workflow/flux-3-klein-base-t2i",
      input,
      "A paper kite.",
      "flux-3-klein-t2i",
    );
    expect(earlier.template).toBe(kleinWorkflow);
  });

  it("refuses to substitute Distilled weights when Base is absent", async () => {
    const info = infoFor(kleinBaseWorkflow.graph);
    info.UNETLoader!.input!.required!.unet_name = [[distilledModel]];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(info));
    const submit = vi.fn(async () => ({ id: "unexpected" }));
    const connect: Connect = () => ({
      workflows: { fromJson: (g) => g },
      submit,
      jobs: {
        get: async () => ({ id: "", status: "", outputs: [], progress: null }),
      },
    });
    const client = new ComfySdkWorkflows({ fetcher, connect, env: {} });
    await expect(
      client.run(
        kleinBaseWorkflow,
        {
          prompt: "Kite",
          layout: "",
          upsample: true,
          width: 1024,
          height: 1024,
          seed: 4,
        },
        "comfyui-test-key",
        { idempotencyKey: "base-only" },
      ),
    ).rejects.toMatchObject({
      code: "workflow_unsent",
      message: expect.stringContaining("Nothing was sent or charged"),
    });
    expect(submit).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
