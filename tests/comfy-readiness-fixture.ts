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
