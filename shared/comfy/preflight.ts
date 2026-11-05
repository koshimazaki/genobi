import type { ApiGraph } from "./slots";
import {
  comboOptions,
  inspectWorkflow,
  type ObjectInfo,
  type TemplateReadiness,
} from "./readiness";
import type { WorkflowTemplate } from "./workflow";

/**
 * The pre-submit check every ComfyUI route runs (#47): the fully filled graph's
 * node classes and model files against the target's own `/object_info`,
 * before any upload or submission. Comfy Cloud, a local ComfyUI and a GPU box
 * (a ComfyUI reached through an SSH tunnel to loopback) share it; a Comfy
 * deployment has its own validator.
 *
 * A declared model slot is reported by its slot name. A model file written
 * into the graph without a slot (a LoRA or an upscaler a template pins) is
 * reported as `NodeClass.input`, so a refusal never repeats a file name or a
 * path. Only a dependency the target definitely lacks blocks a run; one whose
 * choices the target does not enumerate stays unknown.
 */
const MODEL_FILE = /\.(?:safetensors|gguf|ckpt|pt|pth|bin|sft)$/i;
const NAME = /^[A-Za-z0-9_+.-]{1,96}$/;

export type GraphCheck = Omit<TemplateReadiness, "status">;

export function preflightGraph(
  template: WorkflowTemplate,
  graph: ApiGraph,
  info: ObjectInfo,
): GraphCheck {
  const check = inspectWorkflow(template, graph, info);
  const declared = new Set(
    Object.values(template.slots)
      .filter((slot) => slot.kind === "model")
      .map((slot) => slot.path),
  );
  const missing = new Set(check.missingModels);
  const unknown = new Set(check.unknownModels);
  for (const [id, node] of Object.entries(graph)) {
    if (check.missingNodes.includes(node.class_type)) continue;
    for (const [input, value] of Object.entries(node.inputs)) {
      if (
        typeof value !== "string" ||
        !MODEL_FILE.test(value) ||
        declared.has(`${id}.${input}`)
      )
        continue;
      const name = `${node.class_type}.${input}`;
      const options = comboOptions(info, node.class_type, input);
      if (options === undefined) unknown.add(name);
      else if (!options.includes(value)) missing.add(name);
    }
  }
  return {
    ...check,
    missingModels: [...missing].sort(),
    unknownModels: [...unknown].filter((name) => !missing.has(name)).sort(),
  };
}

/** Whether a check found something the target definitely lacks. */
export const blocks = (check: GraphCheck) =>
  check.missingNodes.length > 0 || check.missingModels.length > 0;

/** Names safe to repeat in a refusal: node classes and slot names only. */
const safe = (names: string[]) => names.filter((name) => NAME.test(name));

/**
 * The refusal a blocked check gives, naming what is missing and what to do.
 * `where` is the target as the person knows it ("Comfy Cloud", "The GPU box").
 */
export function preflightMessage(
  where: string,
  check: GraphCheck,
  fix: { nodes: string; models: string },
): string {
  const parts: string[] = [];
  if (check.missingNodes.length)
    parts.push(
      `${where} lacks the node types this workflow needs: ${safe(check.missingNodes).join(", ") || "unnamed nodes"}. ${fix.nodes}`,
    );
  if (check.missingModels.length)
    parts.push(
      `${where} does not list the model file for ${safe(check.missingModels).join(", ") || "a loader"}. ${fix.models}`,
    );
  return `${parts.join(" ")} Nothing was sent or charged.`;
}
