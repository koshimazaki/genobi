import {
  MAX_IMAGE_REQUEST_BYTES,
  IMAGE_DESCRIPTION_LIMIT,
  imageReference,
} from "../shared/image";
import { LayoutError, readLayout } from "../shared/image-layout";
import { entryFor } from "../shared/registry";
import type { GenerateInput } from "../shared/types";
import { AppError } from "./errors";
import { validateCamera } from "./validate-camera";

const IMAGE_MODELS = new Set(["flux-3", "flux-3-klein", "flux-3-klein-api"]);

/**
 * An Image or Edit request, held to the registry entry it names, as a video
 * request is held to its own: the entry's ratios, tiers, grounding and
 * references. Layout rows in the prompt are read back (`shared/image-layout.ts`)
 * so a box outside BFL's 0–1000 grid, inverted, or naming a reference the
 * request does not carry is refused on both adapters before anything is priced.
 * Every FLUX still keeps the camera's framing; movement is dropped, as the
 * composer drops it, so the stored run says what the model was asked for.
 */
export function validateImage(
  body: Record<string, unknown>,
  revision: { projectRevision?: number },
): GenerateInput {
  const generator = body.generator as "image" | "edit";
  const model = (body.model ?? "flux-3") as GenerateInput["model"];
  if (typeof model !== "string" || !IMAGE_MODELS.has(model))
    throw new AppError(400, "Images run on FLUX 3 or FLUX 3 Image Klein.");
  const controls = entryFor(generator, model).controls;
  if (controls.kind !== "image")
    throw new AppError(400, "Choose supported image settings.");
  if (
    typeof body.description !== "string" ||
    !body.description.trim() ||
    body.description.length > IMAGE_DESCRIPTION_LIMIT
  )
    throw new AppError(
      400,
      "Describe the image or edit in under 12,000 characters.",
    );
  const refs = body.imageReferences ?? [];
  if (
    !Array.isArray(refs) ||
    refs.length > 10 ||
    (generator === "edit" && refs.length === 0)
  )
    throw new AppError(
      400,
      "Edits need a source image; use up to ten references.",
    );
  if (refs.length && !controls.references)
    throw new AppError(
      400,
      "Klein's open workflow takes no reference images yet. Remove them, or choose the API run.",
    );
  let bytes = 0;
  try {
    for (const ref of refs) bytes += imageReference(ref).bytes.length;
  } catch (error) {
    throw new AppError(400, (error as Error).message);
  }
  if (bytes > MAX_IMAGE_REQUEST_BYTES * 0.7)
    throw new AppError(400, "Keep all references under 11 MB combined.");
  try {
    readLayout(body.description, refs.length);
  } catch (error) {
    if (error instanceof LayoutError) throw new AppError(400, error.message);
    throw error;
  }
  const resolution = body.imageResolution ?? "1k",
    ratio =
      body.imageAspectRatio ??
      (controls.aspectRatios.includes("auto") ? "auto" : "1:1"),
    grounding = body.imageGrounding ?? false,
    tolerance = body.imageSafetyTolerance ?? 2;
  if (
    !controls.resolutions.includes(resolution as never) ||
    !controls.aspectRatios.includes(ratio as never) ||
    typeof grounding !== "boolean" ||
    (grounding && !controls.grounding) ||
    !Number.isInteger(tolerance) ||
    Number(tolerance) < 0 ||
    Number(tolerance) > 4
  )
    throw new AppError(400, "Choose supported image settings.");
  const cameraEnabled = controls.camera && body.cameraEnabled === true;
  let still = {};
  if (cameraEnabled) {
    const { camera, cameraEdits } = validateCamera(
      body.camera,
      body.cameraEdits,
    );
    const movement = camera.movements;
    if (movement) delete cameraEdits[movement];
    still = { camera: { ...camera, movements: null }, cameraEdits };
  }
  return {
    generator,
    model,
    description: body.description.trim(),
    imageReferences: refs as string[],
    imageResolution: resolution as GenerateInput["imageResolution"],
    imageAspectRatio: ratio as GenerateInput["imageAspectRatio"],
    imageGrounding: grounding,
    imageSafetyTolerance: tolerance as number,
    ...still,
    cameraEnabled,
    duration: 5,
    resolution: "hd",
    aspectRatio: "1:1",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    ...revision,
  };
}
