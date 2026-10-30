import type { GenerateInput } from "../shared/types";
import { AppError } from "./errors";
import { probeVideo } from "./media";

/**
 * The clip a swap reads, measured from its own bytes: the part must start
 * inside it. The deployment client uploads the clip as an asset, so the
 * request body's own bound does not apply to it.
 */
export async function swapSource(input: GenerateInput, file: string) {
  const metadata = await probeVideo(file);
  if ((input.swap?.start ?? 0) >= metadata.duration)
    throw new AppError(400, "The part must start inside the clip.");
  return metadata;
}
