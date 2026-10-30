import type { GenerateInput } from "../types";
import { deployInvalid, DEPLOY_FILE_TOKENS } from "./deploy-input";
import { isDeployModel, deployEndpoint } from "./deploy-catalogue";
import type { ApiGraph, WorkflowSlot } from "./slots";
import type { WorkflowTemplate } from "./workflow";
import layout from "../../workflows/world-builder-l2r-a2v.json";
import studio from "../../workflows/world-builder-l2r-a2v-studio.json";
import akuspace from "../../workflows/ltx-i2v-a2v-akuspace.json";

const graphs = [
  ["world-builder-l2r-a2v", layout],
  ["world-builder-l2r-a2v-studio", studio],
  ["ltx-i2v-a2v-akuspace", akuspace],
] as const;
const TOKEN = /^__([A-Z0-9_]+)__$/;

/** Paths are read from the exact templates, including repeated placeholders. */
export function deploySlots(graph: ApiGraph) {
  const slots: Record<string, WorkflowSlot> = {};
  for (const [id, node] of Object.entries(graph))
    for (const [key, value] of Object.entries(node.inputs)) {
      const token =
        typeof value === "string" ? TOKEN.exec(value)?.[1] : undefined;
      if (
        !token &&
        typeof value === "string" &&
        /\.(safetensors|gguf)$/.test(value)
      )
        slots[`${id}.${key}`] = { path: `${id}.${key}`, kind: "model" };
      if (token)
        slots[`${id}.${key}`] = {
          path: `${id}.${key}`,
          kind: (DEPLOY_FILE_TOKENS as readonly string[]).includes(token)
            ? "asset"
            : /SEED/.test(token)
              ? "number"
              : "text",
        };
    }
  return slots;
}

export const deployTemplates: WorkflowTemplate[] = graphs.map(
  ([id, graph]) => ({
    id,
    file: `workflows/${id}.json`,
    graph: graph as ApiGraph,
    slots: deploySlots(graph as ApiGraph),
    hosts: ["deployment"],
    requiredNodes: [...new Set(Object.values(graph).map((n) => n.class_type))],
    requiredModels: [],
    output: {
      nodeId: Object.entries(graph).find(
        ([, node]) => node.class_type === "SaveVideo",
      )![0],
      media: "video",
      companions: Object.entries(graph)
        .filter(([, node]) => node.class_type.startsWith("SaveAudio"))
        .map(([nodeId]) => ({
          nodeId,
          label:
            nodeId === "11"
              ? "Room impulse response"
              : nodeId === "13"
                ? "Room wet mix"
                : "Workflow audio",
        })),
    },
  }),
);

/** materialize-ltx.py's full-value placeholders; camera wording arrives composed. */
export function deployValues(
  template: WorkflowTemplate,
  input: GenerateInput,
  prompt: string,
) {
  if (!isDeployModel(input.model) || !input.deploy)
    throw deployInvalid("Attach deployment inputs.");
  if (/__[A-Z0-9_]+__/.test(prompt))
    throw deployInvalid("Remove unresolved prompt placeholders.");
  const { seed, negativePrompt, assets, recipe } = input.deploy;
  const tokens: Record<string, unknown> = {
    PROMPT: prompt,
    NEGATIVE_PROMPT: negativePrompt,
    SEED_STAGE_1: seed,
    SEED_STAGE_2: seed,
    REVERB_SEED: seed % 2 ** 32,
    VIDEO_PREFIX: "video/genobi",
    AUDIO_PREFIX: "audio/genobi",
    IR_PREFIX: "audio/genobi-ir",
    WET_PREFIX: "audio/genobi-wet",
    RECIPE_JSON: recipe,
    ...assets,
  };
  const needed = new Set<string>();
  const values: Record<string, unknown> = {};
  for (const path of Object.keys(template.slots)) {
    const dot = path.indexOf(".");
    const token = TOKEN.exec(
      String(template.graph[path.slice(0, dot)].inputs[path.slice(dot + 1)]),
    )?.[1];
    if (!token) continue;
    needed.add(token);
    // Depth is optional in the original materializer; no guide is an empty filename.
    const value = tokens[token] ?? (token === "DEPTH_WEBM" ? "" : undefined);
    if (value === undefined)
      throw deployInvalid(
        `Attach ${token.toLowerCase().replaceAll("_", " ")} for ${deployEndpoint(input.model).name}.`,
      );
    values[path] = value;
  }
  for (const token of Object.keys(assets))
    if (!needed.has(token))
      throw deployInvalid("This template does not use that input file.");
  if (recipe !== undefined && !needed.has("RECIPE_JSON"))
    throw deployInvalid("This template does not use a capture recipe.");
  return values;
}

/** Fixed graph geometry, before decoding; no generic HD promise for these recipes. */
export function deployGeometry(
  model: import("./deploy-catalogue").DeployModel,
  selected?: string,
) {
  const endpoint = deployEndpoint(model);
  const graph = deployTemplates.find(
    (t) => t.id === (selected ?? endpoint.workflow.slice(0, -5)),
  )!.graph;
  const resize = graph["9"]?.inputs;
  if (resize)
    return `${Number(resize["resize_type.width"]) * 2} × ${Number(resize["resize_type.height"]) * 2}`;
  if (graph["26"])
    return `${Number(graph["26"].inputs.value) * 2} × ${Number(graph["27"].inputs.value) * 2}`;
  return `${graph["398:372"].inputs.value} × ${graph["398:360"].inputs.value}`;
}
