import { useRef, useState } from "react";
import type { ComposerState } from "../useComposer";
import {
  IMAGE_ACCEPT,
  REFERENCE_DRAG,
  type ImageReferences,
} from "../useImageReferences";
import { imageEditing } from "../../shared/image";
import { entryFor } from "../../shared/registry";
import Icon from "./Icon";
import ReferencePreview from "./ReferencePreview";

export default function ImageReferenceTray({
  state,
  images,
  max = 10,
  hint,
}: {
  state: ComposerState;
  images: ImageReferences;
  max?: number;
  hint?: string;
}) {
  const files = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(
    null,
  );
  const refs = state.imageReferences ?? [];
  const { controls } = entryFor(state.generator, state.model);
  const takesRefs = controls.kind !== "image" || controls.references;
  return (
    <>
      <section
        className="image-references"
        aria-label="Reference images"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          // Files from disk, or an image dragged from the project's assets.
          // A run that takes none still keeps them (the hint says so), as a
          // drop on the stage does; the run itself is sent none.
          images.drop(e.dataTransfer);
        }}
      >
        <header>
          <span>
            IMAGES · {refs.length}/{max}
          </span>
          <span>
            {hint ??
              (!takesRefs
                ? "Not sent on the open run · kept for API"
                : imageEditing(state)
                  ? "1 = source · drag a thumbnail onto a box"
                  : "Optional references")}
          </span>
        </header>
        <div className="image-reference-strip">
          {refs.map((url, index) => (
            <div
              className="image-reference"
              key={index}
              draggable={!images.loading}
              onDragStart={(e) => {
                e.dataTransfer.setData(REFERENCE_DRAG, String(index));
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <button
                type="button"
                className="image-reference-preview"
                aria-label={`Enlarge reference ${index + 1}`}
                title="Click to enlarge reference"
                onClick={() =>
                  setPreview({ url, label: `Reference ${index + 1}` })
                }
              >
                <img
                  src={url}
                  alt={`Reference image ${index + 1}`}
                  draggable={false}
                />
              </button>
              <span className="image-reference-number">{index + 1}</span>
              <div className="image-reference-actions">
                <button
                  aria-label={
                    index === 0 && imageEditing(state)
                      ? "Clear source and references"
                      : `Remove image ${index + 1}`
                  }
                  disabled={images.loading}
                  onClick={() => images.remove(index)}
                >
                  <Icon name="close" size={10} />
                </button>
                {index > 0 && (
                  <button
                    aria-label={`Move image ${index + 1} earlier`}
                    disabled={images.loading}
                    onClick={() => images.earlier(index)}
                  >
                    ←
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            className="image-add-reference"
            aria-label="Add reference images"
            onClick={() => files.current?.click()}
            disabled={images.loading || refs.length >= max}
          >
            <Icon name="image" size={17} />
            <span>{images.loading ? "Reading…" : "Add / drop"}</span>
          </button>
        </div>
        <input
          ref={files}
          className="sr-only"
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          aria-label="Choose reference images"
          onChange={(e) => {
            void images.add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </section>
      {preview && (
        <ReferencePreview {...preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
