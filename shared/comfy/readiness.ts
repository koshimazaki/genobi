import type { ApiGraph } from "./slots";
import type { WorkflowTemplate } from "./workflow";

/** Only the node-schema fields needed to inspect declared model slots. */
export type ObjectInfo = Record<
  string,
  { input?: Record<string, Record<string, unknown> | undefined> } | undefined
>;

export interface TemplateReadiness {
  status: "compatible" | "blocked" | "unknown" | "deployment-required";
  missingNodes: string[];
  /** Slot names only: never return an account's model catalogue or paths. */
  missingModels: string[];
  unknownNodes: string[];
  unknownModels: string[];
}

export interface CloudReadiness {
  destination: "cloud";
  checkedAt: string;
  templates: Record<string, TemplateReadiness>;
  note: string;
}

export const CLOUD_CHECK_NOTE =
  "Checks the pinned templates' node classes and declared model slots on this Comfy Cloud account. No generation is submitted. Input compatibility, GPU execution and output quality still need validation. This does not check a custom deployment.";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** An error envelope or malformed response is not an empty node catalogue. */
export function isObjectInfo(value: unknown): value is ObjectInfo {
  return (
    record(value) &&
    Object.values(value).some((node) => record(node) && record(node.input))
  );
}

/** ComfyUI lists combo inputs in both its original and COMBO schemas. */
function comboOptions(info: ObjectInfo, type: string, input: string) {
  const inputs = info[type]?.input;
  const spec = inputs?.required?.[input] ?? inputs?.optional?.[input];
  if (!Array.isArray(spec)) return undefined;
  if (Array.isArray(spec[0])) return spec[0];
  const options = record(spec[1]) ? spec[1].options : undefined;
  return spec[0] === "COMBO" && Array.isArray(options) ? options : undefined;
}

/**
 * Inspect the actual graph, not its abbreviated requiredNodes documentation.
 * A loader with no enumerable choices is unknown, never silently compatible.
 * This is metadata compatibility only, not a workflow execution preflight.
 */
export function inspectWorkflow(
  template: WorkflowTemplate,
  graph: ApiGraph,
  info: ObjectInfo,
): Omit<TemplateReadiness, "status"> {
  const types = [...new Set(Object.values(graph).map((n) => n.class_type))];
  const missingNodes = types
    .filter((type) => !Object.hasOwn(info, type) || info[type] == null)
    .sort();
  const unknownNodes = types
    .filter(
      (type) => !missingNodes.includes(type) && !record(info[type]?.input),
    )
    .sort();
  const missingModels: string[] = [];
  const unknownModels: string[] = [];
  for (const [name, slot] of Object.entries(template.slots)) {
    if (slot.kind !== "model") continue;
    const dot = slot.path.indexOf(".");
    const node = graph[slot.path.slice(0, dot)];
    if (!node) {
      unknownModels.push(name);
      continue;
    }
    if (missingNodes.includes(node.class_type)) continue;
    const input = slot.path.slice(dot + 1);
    const options = comboOptions(info, node.class_type, input);
    const value = node.inputs[input];
    if (options === undefined || typeof value !== "string")
      unknownModels.push(name);
    else if (!options.includes(value)) missingModels.push(name);
  }
  return { missingNodes, missingModels, unknownNodes, unknownModels };
}

export function cloudReadiness(
  templates: readonly WorkflowTemplate[],
  info: ObjectInfo,
  checkedAt: string,
): CloudReadiness {
  return {
    destination: "cloud",
    checkedAt,
    note: CLOUD_CHECK_NOTE,
    templates: Object.fromEntries(
      templates.map((template) => {
        const check = inspectWorkflow(template, template.graph, info);
        const status: TemplateReadiness["status"] = template.hosts?.length
          ? "deployment-required"
          : check.missingNodes.length || check.missingModels.length
            ? "blocked"
            : check.unknownNodes.length || check.unknownModels.length
              ? "unknown"
              : "compatible";
        return [template.id, { status, ...check }];
      }),
    ),
  };
}
