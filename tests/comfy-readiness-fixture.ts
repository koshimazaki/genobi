import type { ObjectInfo } from "../shared/comfy/readiness";
import type { ApiGraph } from "../shared/comfy/slots";
import { nodesFor } from "./fake-comfyui";

/** A catalogue fixture containing the graph's nodes and its loader choices. */
export function infoFor(graph: ApiGraph): ObjectInfo {
  return Object.fromEntries(
    Object.entries(nodesFor(graph)).map(([name, inputs]) => [
      name,
      {
        input: {
          required: Object.fromEntries(
            Object.entries(inputs).map(([input, options]) => [
              input,
              [options],
            ]),
          ),
        },
      },
    ]),
  );
}

/** One catalogue listing every graph's nodes and loader files together. */
export const infoForGraphs = (...graphs: ApiGraph[]): ObjectInfo =>
  infoFor(
    Object.fromEntries(
      graphs.flatMap((graph, index) =>
        Object.entries(graph).map(([id, node]) => [`${index}/${id}`, node]),
      ),
    ),
  );
