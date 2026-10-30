import { fillSlots, type ApiGraph } from "../shared/comfy/slots";
import {
  unsent,
  type WorkflowFile,
  type WorkflowTemplate,
} from "../shared/comfy/workflow";

export interface SdkAssets {
  fromBytes(
    bytes: Uint8Array,
    options: { filename: string; contentType: string },
  ): {
    asReference(signal?: AbortSignal): Promise<object>;
  };
}
const extensions: Record<WorkflowFile["contentType"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

/** Validate every slot before uploading. Upload failures are known unsent jobs;
 * only the later submit can incur an uncertain generation charge.
 */
export async function workflowAssetGraph(
  template: WorkflowTemplate,
  values: Record<string, unknown>,
  files: Record<string, WorkflowFile>,
  assets?: SdkAssets,
): Promise<ApiGraph> {
  for (const [name, file] of Object.entries(files)) {
    const kind = template.slots[name]?.kind;
    if (
      (kind !== "image" && kind !== "video") ||
      !file.contentType.startsWith(`${kind}/`) ||
      !file.bytes.length
    )
      throw unsent("This workflow does not take that input file.");
  }
  const graph = fillSlots(template.graph, template.slots, {
    ...values,
    ...Object.fromEntries(Object.keys(files).map((name) => [name, "pending"])),
  });
  if (!Object.keys(files).length) return graph;
  if (!assets) throw unsent("This workflow client cannot upload references.");
  try {
    for (const [name, file] of Object.entries(files)) {
      const reference = await assets
        .fromBytes(file.bytes, {
          filename: `${name}.${extensions[file.contentType]}`,
          contentType: file.contentType,
        })
        .asReference(AbortSignal.timeout(60_000));
      const path = template.slots[name].path,
        dot = path.indexOf(".");
      graph[path.slice(0, dot)].inputs[path.slice(dot + 1)] = reference;
    }
  } catch {
    throw unsent(
      "The reference upload could not be completed. No generation was submitted.",
    );
  }
  return graph;
}
