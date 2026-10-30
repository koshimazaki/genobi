import { AppError } from "../../server/errors";

/**
 * A Comfy API-format graph: node id to class and inputs. An input is a literal
 * or a link, `[nodeId, outputIndex]`. Node ids from a flattened subgraph carry
 * a colon (`398:376`); input names can carry dots (`values.a`), so a slot path
 * splits at its first dot only.
 */
export interface ApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}
export type ApiGraph = Record<string, ApiNode>;
export interface WorkflowSlot {
  /** `nodeId.inputName` inside the API-format JSON. */
  path: string;
  kind: "text" | "number" | "boolean" | "image" | "video" | "model" | "asset";
  /**
   * An optional input, and what a run without a value for it removes: `drop`
   * names nodes (`anchor_fit`) or inputs (`803.anchor`) to delete, `set` the
   * literal inputs to write instead (`803.use_anchor: false`). The filled
   * graph must still have no dangling link, or the run is refused unsent.
   */
  whenAbsent?: {
    drop: string[];
    set?: Record<string, string | number | boolean>;
  };
}

export const isLink = (value: unknown): value is [string, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  Number.isInteger(value[1]);

/** Every link in the graph that names a node the graph does not hold. */
export function danglingLinks(graph: ApiGraph): string[] {
  const problems: string[] = [];
  for (const [id, node] of Object.entries(graph))
    for (const [input, value] of Object.entries(node.inputs))
      if (isLink(value) && !(value[0] in graph))
        problems.push(`${id}.${input} -> ${value[0]}`);
  return problems;
}

const mismatch = () =>
  new AppError(
    503,
    "This workflow does not match the studio's slots. Nothing was sent or charged.",
    "cloud_unavailable",
  );
const fits = (kind: WorkflowSlot["kind"], value: unknown) =>
  kind === "asset"
    ? typeof value === "string" ||
      (!!value &&
        typeof value === "object" &&
        (value as { __type?: string }).__type === "core/ASSET")
    : kind === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : kind === "boolean"
        ? typeof value === "boolean"
        : typeof value === "string";

/**
 * A copy of `graph` with each value written at its slot's path. The source is
 * never changed. A value with no slot, a path the graph does not hold, a slot
 * that holds a link, or a value of the wrong kind refuses the run before
 * anything is sent: a filled graph that quietly kept the template's own prompt
 * would still be charged.
 */
export function fillSlots(
  graph: ApiGraph,
  slots: Record<string, WorkflowSlot>,
  values: Record<string, unknown>,
): ApiGraph {
  const filled = JSON.parse(JSON.stringify(graph)) as ApiGraph;
  for (const [name, value] of Object.entries(values)) {
    const slot = slots[name];
    if (!slot || !fits(slot.kind, value)) throw mismatch();
    const dot = slot.path.indexOf(".");
    const node = filled[slot.path.slice(0, dot)];
    const input = slot.path.slice(dot + 1);
    if (
      dot < 1 ||
      !node ||
      !(input in node.inputs) ||
      isLink(node.inputs[input])
    )
      throw mismatch();
    node.inputs[input] = value;
  }
  for (const [name, slot] of Object.entries(slots))
    if (slot.whenAbsent && !(name in values)) leaveOut(filled, slot.whenAbsent);
  return filled;
}

/** Splits `node.input` at its first dot; a bare node id has no input. */
const split = (path: string) => {
  const dot = path.indexOf(".");
  return dot < 0
    ? { node: path, input: undefined }
    : { node: path.slice(0, dot), input: path.slice(dot + 1) };
};

/** Applies an absent slot's rule to a filled copy, or refuses the run. */
function leaveOut(
  graph: ApiGraph,
  rule: NonNullable<WorkflowSlot["whenAbsent"]>,
) {
  for (const path of rule.drop) {
    const { node, input } = split(path);
    if (!graph[node] || (input !== undefined && !(input in graph[node].inputs)))
      throw mismatch();
    if (input === undefined) delete graph[node];
    else delete graph[node].inputs[input];
  }
  for (const [path, value] of Object.entries(rule.set ?? {})) {
    const { node, input } = split(path);
    const target = graph[node];
    if (
      input === undefined ||
      !target ||
      !(input in target.inputs) ||
      isLink(target.inputs[input])
    )
      throw mismatch();
    target.inputs[input] = value;
  }
  if (danglingLinks(graph).length) throw mismatch();
}
