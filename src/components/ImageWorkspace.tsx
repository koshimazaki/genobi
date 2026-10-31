import type { ComposerState } from "../useComposer";
import type { ImageReferences } from "../useImageReferences";
import {
  IMAGE_DESCRIPTION_LIMIT,
  imageEditing,
  isKlein,
} from "../../shared/image";
import { cameraClauses } from "../../shared/camera";
import { takesCamera } from "../../shared/controls";
import { entryFor } from "../../shared/registry";
import PromptField from "./PromptField";
import ImageReferenceTray from "./ImageReferenceTray";
import { imagePrompt } from "../image-regions";
import "../styles/image-references.css";

export default function ImageWorkspace({
  state,
  update,
  images,
  onOpenCamera,
}: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
  images: ImageReferences;
  onOpenCamera: () => void;
}) {
  const over =
    imagePrompt(
      state.description,
      isKlein(state.model) ? state.imageRegions : [],
      imageEditing(state),
    ).length - IMAGE_DESCRIPTION_LIMIT;
  const clauses =
    state.cameraEnabled &&
    takesCamera(entryFor(state.generator, state.model).controls)
      ? cameraClauses(
          { ...state.camera, movements: null },
          state.cameraEdits,
          state.model,
        )
      : [];
  return (
    <div className="image-workspace">
      <div className="image-prompt">
        <PromptField
          id="image-prompt"
          label={
            imageEditing(state) ? "Describe your edit" : "Describe your image"
          }
          labelClassName="upscale-prompt-label"
          value={state.description}
          onChange={(description) => update({ description })}
          maxLength={IMAGE_DESCRIPTION_LIMIT}
          placeholder={
            imageEditing(state)
              ? "Describe what should change in the source image…"
              : "Describe a scene, character, texture or asset…"
          }
        />
        {clauses.length > 0 && (
          <button
            className="camera-sentences"
            onClick={onOpenCamera}
            aria-label="Edit camera direction"
          >
            {clauses.map(({ section, term, text }) => (
              <span key={term.id} style={{ color: `var(${section.color})` }}>
                {text}{" "}
              </span>
            ))}
          </button>
        )}
      </div>
      <ImageReferenceTray state={state} images={images} />
      {over > 0 && (
        <p role="alert" className="image-notice">
          Prompt and layout are {over.toLocaleString()} characters over the
          12,000-character limit. Shorten the prompt or box descriptions.
        </p>
      )}
      {images.notice && (
        <p role="status" className="image-notice">
          {images.notice}
        </p>
      )}
    </div>
  );
}
