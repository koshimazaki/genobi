import { imagePrompt, type Box } from "../image-regions";
import type { GenerateInput } from "../../shared/types";
import { GENMOD_STILL_INSTRUCTION } from "../../shared/genmod/plan";
export function swapInput(
  mode: "character" | "face" | "background" | "clothing",
  references: string[],
  box: Box,
  notes: string,
): GenerateInput {
  if (references.length !== 2)
    throw new Error("Choose a scene and a replacement reference");
  if (
    box.length !== 4 ||
    box.some((n) => !Number.isFinite(n) || n < 0 || n > 1000) ||
    box[0] >= box[2] ||
    box[1] >= box[3]
  )
    throw new Error("Box must be [top,left,bottom,right] on the 0–1000 grid");
  if (notes.length > 2000)
    throw new Error("Instructions limit is 2000 characters");
  const description =
    mode === "clothing"
      ? "Replace only the clothing inside the target region using image 2. Preserve the person's face, identity, body, pose, framing and background."
      : GENMOD_STILL_INSTRUCTION[mode];
  return {
    generator: "edit",
    description: imagePrompt(
      `${description} ${notes}`,
      [
        {
          id: "swap",
          box,
          action: "change",
          description: mode,
          referenceIndex: 1,
        },
      ],
      true,
    ),
    imageReferences: references,
    imageAspectRatio: "auto",
    imageResolution: "1k",
    imageGrounding: false,
    imageSafetyTolerance: 2,
    cameraEnabled: false,
    duration: 5,
    resolution: "hd",
    aspectRatio: "9:16",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
  };
}
