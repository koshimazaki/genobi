import { h3Files, isH3 } from "../shared/h3";
import { isSeedvr2, seedvr2Files } from "../shared/comfy/seedvr2";
import type { GenerateInput } from "../shared/types";
import { unsent } from "../shared/comfy/workflow";
import type { ResolvedSource } from "./storage";

/**
 * A hosted workflow's input files, H3's or SeedVR2's. Source already resolved
 * by session ownership; catalogue bytes stay on ASSETS.
 */
export async function h3WorkflowFiles(
  env: Env,
  input: GenerateInput,
  source: ResolvedSource,
  origin: string,
) {
  let bytes: ArrayBuffer;
  if (source.kind === "session") {
    const object = await env.MEDIA.get(source.key);
    if (!object || object.size > 50_000_000)
      throw unsent("The reference video is unavailable or too large.");
    bytes = await object.arrayBuffer();
  } else {
    const url = new URL(source.source.url, origin);
    if (url.origin !== new URL(origin).origin)
      throw unsent("Choose a clip from this studio.");
    const response = await env.ASSETS.fetch(new Request(url));
    if (!response.ok) throw unsent("The reference video is unavailable.");
    // Shipped library clips are bounded at catalogue validation/build time.
    bytes = await response.arrayBuffer();
  }
  return isSeedvr2(input.model)
    ? seedvr2Files(new Uint8Array(bytes))
    : h3Files(input, new Uint8Array(bytes));
}

/** Whether a hosted workflow run reads the session's clip: H3 and SeedVR2. */
export const readsClip = (input: Pick<GenerateInput, "model">) =>
  isH3(input.model) || isSeedvr2(input.model);
