import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { validateInput } from "../server/validation";
import { kleinValues, kleinWorkflow } from "../shared/comfy/klein";
import {
  kleinEditTemplate,
  kleinEditValues,
  kleinFiles,
} from "../shared/comfy/klein-edit";
import { parseLocalModels } from "../shared/comfy/local-models";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";

const png = await readFile("tests/fixtures/reference.png");
const reference = `data:image/png;base64,${png.toString("base64")}`;
let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

describe("Klein source-conditioned input contract", () => {
  it.each(["image", "edit"])(
    "refuses an unsupported explicit canvas before quoting a %s with references",
    (generator) => {
      const input = {
        generator,
        model: "flux-3-klein",
        description: "Recolour the subject",
        imageReferences: [reference],
      };
      expect(() =>
        validateInput({ ...input, imageAspectRatio: "16:9" }),
      ).toThrow(/preserve the first reference's aspect ratio/);
      expect(validateInput(input).imageAspectRatio).toBe("auto");
      expect(
        validateInput({ ...input, imageAspectRatio: "auto" }).imageAspectRatio,
      ).toBe("auto");
      expect(
        validateInput({
          ...input,
          model: "flux-3-klein-api",
          imageAspectRatio: "16:9",
        }).imageAspectRatio,
      ).toBe("16:9");
    },
  );

  it("retains explicit canvas sizes for text-only Klein generation", () => {
    expect(
      validateInput({
        generator: "image",
        model: "flux-3-klein",
        description: "A mountain landscape",
        imageAspectRatio: "16:9",
      }).imageAspectRatio,
    ).toBe("16:9");
  });

  it("uses a complete valid local model map for text generation and source editing", async () => {
    const overrides = {
      unet_name: "custom/klein.safetensors",
      text_encoder: "custom/encoder.safetensors",
      upsampler_encoder: "custom/upsampler.safetensors",
      vae: "custom/vae.safetensors",
    };
    const models = parseLocalModels(
      JSON.stringify({ [kleinWorkflow.id]: overrides }),
    );
    const edit = kleinEditTemplate(1);
    fake = await fakeComfy({
      nodes: {
        ...nodesFor(kleinWorkflow.graph, overrides),
        ...nodesFor(edit.graph, overrides),
      },
    });
    const client = new LocalComfyWorkflows({ url: fake.url, models });
    await client.run(
      kleinWorkflow,
      kleinValues({ imageAspectRatio: "16:9" }, "A mountain", () => 0),
      "",
      { idempotencyKey: "0f6c3c34-6a43-4e62-9c3b-2f9a1d2e7b11" },
    );
    const input = validateInput({
      generator: "edit",
      model: "flux-3-klein",
      description: "Make the sky blue",
      imageReferences: [reference],
    });
    await client.run(edit, kleinEditValues(input, input.description), "", {
      idempotencyKey: "0f6c3c34-6a43-4e62-9c3b-2f9a1d2e7b12",
      files: kleinFiles(input),
    });
    expect(fake.prompts).toHaveLength(2);
    expect(fake.prompts[0].prompt["18:12"].inputs.clip_name).toBe(
      overrides.upsampler_encoder,
    );
    const graph = fake.prompts[1].prompt;
    expect(graph["18:12"]).toBeUndefined();
    expect(graph["18:1"].inputs.unet_name).toBe(overrides.unet_name);
    expect(graph["18:2"].inputs.clip_name).toBe(overrides.text_encoder);
    expect(graph["18:3"].inputs.vae_name).toBe(overrides.vae);
    expect(graph["reference-0"].inputs.image).toMatch(/^genobi\//);
    expect(
      fake.requests.filter((request) => request.path === "/upload/image"),
    ).toHaveLength(1);
  });
});
