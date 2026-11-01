import type { ComposerState } from "./useComposer";
import type { GenerateInput } from "../shared/types";
import { imagePrompt } from "./image-regions";
import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import { isH3, takesVideoReferences } from "../shared/h3";
import { imageEditing, isImage, isKlein } from "../shared/image";
import { entryFor } from "../shared/registry";
import { takesCamera } from "../shared/controls";
import { cameraClauses } from "../shared/camera";

export function requestInput({
  openOnly: _openOnly,
  acoustic,
  imageRegions,
  imageReferences,
  imageResolution,
  imageAspectRatio,
  imageGrounding,
  imageSafetyTolerance,
  lyrics,
  deploy,
  ...state
}: Omit<ComposerState, "slots" | "light" | "lightEdits">): GenerateInput {
  const edit = imageEditing({ ...state, imageReferences });
  const entry = entryFor(state.generator, state.model);
  const { controls } = entry;
  if (!isKlein(state.model)) imageRegions = [];
  return {
    ...state,
    ...(isDeployModel(state.model) && deploy ? { deploy } : {}),

    ...(controls.kind === "audio" ? { lyrics: lyrics ?? "" } : {}),
    ...(takesVideoReferences(state.model)
      ? { imageReferences: imageReferences ?? [] }
      : {}),
    ...(isImage(state.generator)
      ? {
          description: imagePrompt(state.description, imageRegions, edit),
          // A run that takes no references is sent none; they stay in the tray.
          imageReferences:
            controls.kind === "image" && !controls.references
              ? []
              : (imageReferences ?? []),
          imageResolution: imageResolution ?? "1k",
          imageProvider:
            state.model === "flux-3" ? (state.imageProvider ?? "auto") : "auto",
          imageAspectRatio: edit
            ? "auto"
            : !edit &&
                imageRegions.length &&
                (!imageAspectRatio || imageAspectRatio === "auto")
              ? "1:1"
              : (imageAspectRatio ?? "auto"),
          imageGrounding: imageGrounding ?? false,
          imageSafetyTolerance: imageSafetyTolerance ?? 2,
        }
      : {}),
    // Only the Acoustic Space entry is sent a treatment.
    ...(entry.controls.kind === "video" && entry.controls.acoustic
      ? { acoustic }
      : {}),
    // The registry's model for the selection: an upscale carries FLUX 3 even
    // when the composer last held LTX, which the server rejects for upscale,
    // or `seedvr2-upscale` when the open upscaler is held.
    model: entry.videoModel,
    cameraEdits: Object.fromEntries(
      cameraClauses(state.camera, state.cameraEdits, state.model).map(
        ({ term, text }) => [term.id, text],
      ),
    ),
    // Video, and a still whose entry keeps the camera's framing.
    cameraEnabled: takesCamera(controls) && state.cameraEnabled,
    draft: state.generator === "video" && state.draft,
    resolution:
      state.draft && state.generator === "video" ? "hd" : state.resolution,
    sourceId:
      state.generator === "upscale" || isH3(state.model)
        ? state.sourceId
        : undefined,
  };
}
