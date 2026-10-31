import { imageReference } from "../image";
import type { GenerateInput } from "../types";
import { kleinWorkflow } from "./klein";
import type { WorkflowFile, WorkflowTemplate } from "./workflow";

/** Comfy's distilled Klein edit wiring: references condition both branches.
 * https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_flux3_klein_distilled_image_edit.json
 * Preserve the first reference's aspect through ReferenceMultiLatent's output.
 */
export function kleinEditTemplate(count: number): WorkflowTemplate {
  const graph = JSON.parse(
    JSON.stringify(kleinWorkflow.graph),
  ) as WorkflowTemplate["graph"];
  const slots = { ...kleinWorkflow.slots };
  graph["reference-latents"] = {
    class_type: "ReferenceMultiLatent",
    inputs: {
      positive: ["18:4", 0],
      negative: ["18:5", 0],
      vae: ["18:3", 0],
      resolution: "resize",
      "resolution.megapixels": 1,
    },
  };
  for (let i = 0; i < count; i++) {
    const id = `reference-${i}`;
    graph[id] = { class_type: "LoadImage", inputs: { image: "pending" } };
    graph["reference-latents"].inputs[`images.image${i}`] = [id, 0];
    slots[id] = { path: `${id}.image`, kind: "image" };
  }
  graph["18:7"].inputs.positive = ["reference-latents", 0];
  graph["18:7"].inputs.negative = ["reference-latents", 1];
  graph["18:7"].inputs.latent_image = ["reference-latents", 2];
  // A text-only upsampler cannot see the source and would strip layout JSON.
  graph["18:4"].inputs.text = ["18:17", 0];
  graph["reference-latents"].inputs["resolution.megapixels"] = 1;
  slots.megapixels = {
    path: "reference-latents.resolution.megapixels",
    kind: "number",
  };
  for (const id of ["18:6", "18:11", "18:12", "18:14", "18:16", "18:20"])
    delete graph[id];
  for (const name of [
    "layout",
    "upsample",
    "width",
    "height",
    "upsampler_encoder",
  ])
    delete slots[name];
  return {
    ...kleinWorkflow,
    graph,
    slots,
    requiredNodes: ["ReferenceMultiLatent", "LoadImage"],
    requiredModels: kleinWorkflow.requiredModels.filter(
      (n) => !n.includes("prompt_upsampler"),
    ),
  };
}
export function kleinEditValues(
  input: GenerateInput,
  prompt: string,
): Record<string, unknown> {
  const edge = (
    { "768sq": 768, "1k": 1024, "1.5k": 1536, "2k": 2048, "4k": 4096 } as const
  )[input.imageResolution ?? "1k"];
  return {
    prompt,
    seed: Math.floor(Math.random() * 2 ** 48),
    megapixels: (edge * edge) / (1024 * 1024),
  };
}
export function kleinFiles(input: GenerateInput): Record<string, WorkflowFile> {
  return Object.fromEntries(
    (input.imageReferences ?? []).map((ref, i) => {
      const { bytes, metadata } = imageReference(ref);
      const contentType = metadata.contentType as WorkflowFile["contentType"];
      return [`reference-${i}`, { bytes, contentType }];
    }),
  );
}
export const isKleinEdit = (
  input: Pick<GenerateInput, "model" | "imageReferences">,
) => input.model === "flux-3-klein" && Boolean(input.imageReferences?.length);
