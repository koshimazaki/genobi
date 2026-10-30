import { imageReference, MAX_IMAGE_REQUEST_BYTES } from "../shared/image";
import { isH3 } from "../shared/h3";
import { isH3Router } from "../shared/comfy/h3-router";
import { AppError } from "./errors";

/**
 * A video run's image references. Both H3 paths take exactly two (OmniRef's
 * identity and look; Router's character sheet and storyboard), FLUX
 * image-to-video one to ten. Router's H3 schema states no image size, so the
 * studio's own bounds hold for every model: each image under 5 MB and at least
 * 256 px a side, all of them under about 11 MB.
 */
export function validateVideoReferences(
  value: unknown,
  model: unknown,
): string[] {
  const pair = isH3(model) || isH3Router(model);
  if (
    !Array.isArray(value) ||
    (pair ? value.length !== 2 : !value.length || value.length > 10)
  )
    throw new AppError(
      400,
      isH3Router(model)
        ? "H3 reference to video needs two images: the character sheet first, the storyboard second."
        : pair
          ? "H3 needs two reference images: identity first, look second."
          : "FLUX image-to-video needs one to ten ordered keyframes.",
    );
  try {
    const bytes = value.reduce(
      (sum, ref) => sum + imageReference(ref).bytes.length,
      0,
    );
    if (bytes > MAX_IMAGE_REQUEST_BYTES * 0.7)
      throw new Error("Keep all reference images under 11 MB combined.");
  } catch (error) {
    throw new AppError(400, (error as Error).message);
  }
  return value as string[];
}
