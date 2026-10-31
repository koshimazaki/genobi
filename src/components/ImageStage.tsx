import PromptResizeHandle from "./PromptResizeHandle";
import ThemedSelect from "./ThemedSelect";
import { useEffect, useId, useRef, useState } from "react";
import type { ComposerState } from "../useComposer";
import type { Box, ImageRegion } from "../image-regions";
import { IMAGE_ACCEPT, type ImageReferences } from "../useImageReferences";
import ImageRegionCanvas from "./ImageRegionCanvas";
import ImageRegionCard from "./ImageRegionCard";
import Icon from "./Icon";
import FeaturedVideo from "./FeaturedVideo";
import type { Job } from "../../shared/types";
import { imageEditing, isImage, isKlein } from "../../shared/image";

export default function ImageStage({
  state,
  update,
  images,
  result,
  previewRevision = 0,
  layoutRevision = 0,
  onRetry = () => {},
}: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
  images: ImageReferences;
  result?: Job;
  previewRevision?: number;
  layoutRevision?: number;
  onRetry?: (job: Job) => void;
}) {
  const mediaId = useId();
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const media = useRef<HTMLDivElement>(null);
  const sourceInput = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null),
    [over, setOver] = useState(false);
  const [layoutFor, setLayoutFor] = useState<string | null>(null);
  const [seenLayoutRevision, setSeenLayoutRevision] = useState(layoutRevision);
  const previewKey = `${result?.id}:${previewRevision}`;
  if (seenLayoutRevision !== layoutRevision) {
    setSeenLayoutRevision(layoutRevision);
    setLayoutFor(previewKey);
  }
  const boxes = isKlein(state.model);
  const refs = state.imageReferences ?? [],
    regions = boxes ? state.imageRegions : [],
    edit = imageEditing(state);
  const active = regions.find((r) => r.id === activeId),
    canDraw = boxes && (!edit || refs.length > 0);
  function add(box: Box) {
    if (regions.length >= 12) return;
    const id = `region_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    update({
      imageRegions: [
        ...regions,
        { id, box, action: "change", description: "" },
      ],
    });
    setActiveId(id);
  }
  const change = (region: ImageRegion) =>
    update({
      imageRegions: regions.map((r) => (r.id === region.id ? region : r)),
    });
  const remove = (id: string) => {
    update({ imageRegions: regions.filter((r) => r.id !== id) });
    setActiveId(null);
  };
  const ready =
    result &&
    isImage(result.generator) &&
    result.status === "Ready" &&
    result.resultUrl &&
    result.mediaAvailable !== false;
  const stage = useRef<HTMLElement>(null);
  const openBoxes = useRef(() => {});
  openBoxes.current = () => {
    if (!canDraw) {
      sourceInput.current?.click();
      return;
    }
    if (canDraw && !regions.length) add([250, 250, 750, 750]);
    const canvas = stage.current?.querySelector<HTMLElement>(
      ".image-region-canvas",
    );
    canvas?.focus();
    canvas?.scrollIntoView?.({ block: "nearest" });
  };
  useEffect(() => {
    if (layoutRevision > 0) openBoxes.current();
  }, [layoutRevision]);
  if (ready && !(edit && refs.length) && (!boxes || layoutFor !== previewKey))
    return (
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          images.drop(event.dataTransfer, "source");
        }}
      >
        <FeaturedVideo
          job={result}
          onRetry={onRetry}
          captionAction={
            boxes ? (
              <button
                className="text-button"
                onClick={() => setLayoutFor(previewKey)}
              >
                {edit ? "Edit layout" : "Arrange layout"}
              </button>
            ) : undefined
          }
        />
      </div>
    );
  return (
    <section
      ref={stage}
      className="featured-video image-stage"
      aria-label="Image editing stage"
    >
      <div
        ref={media}
        id={mediaId}
        style={
          manualHeight === null
            ? undefined
            : { height: manualHeight, maxHeight: "none" }
        }
        className="featured-media image-stage-media"
        data-dragging={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          images.drop(e.dataTransfer, edit || boxes ? "source" : "tray");
        }}
      >
        {canDraw ? (
          <ImageRegionCanvas
            source={edit ? refs[0] : undefined}
            ratio={state.imageAspectRatio ?? "auto"}
            regions={regions}
            activeId={activeId}
            refs={refs}
            images={images}
            onSelect={setActiveId}
            onAdd={add}
            onChange={change}
            onRemove={remove}
          />
        ) : edit && refs.length ? (
          <img
            src={refs[0]}
            alt="Source image to edit"
            className="image-stage-source"
          />
        ) : !edit ? (
          <div className="image-source-drop">
            <Icon name="image" size={36} />
            <strong>Describe your image below</strong>
            <span>Choose FLUX Klein for bounding boxes</span>
          </div>
        ) : (
          <button
            className="image-source-drop"
            onClick={() => sourceInput.current?.click()}
            disabled={images.loading}
          >
            <Icon name="image" size={36} />
            <strong>
              {images.loading
                ? "Reading image…"
                : "Drop the image you want to edit"}
            </strong>
            <span>or choose a PNG, JPEG or WebP</span>
          </button>
        )}
        <div className="image-stage-tools">
          <span>{edit ? "IMAGE EDIT" : boxes ? "IMAGE LAYOUT" : "IMAGE"}</span>
          <div>
            {ready && !(edit && refs.length) && (
              <button onClick={() => setLayoutFor(null)}>View result</button>
            )}
            {(edit || boxes) && (
              <button
                disabled={images.loading}
                onClick={() => sourceInput.current?.click()}
              >
                {refs.length ? "Replace source" : "Drop / choose image"}
              </button>
            )}
            {canDraw && (
              <button
                disabled={images.loading || regions.length >= 12}
                onClick={() => add([250, 250, 750, 750])}
              >
                + Add box
              </button>
            )}
            {regions.length > 0 && (
              <ThemedSelect
                aria-label="Select box"
                value={active?.id ?? ""}
                onChange={(e) => setActiveId(e.target.value || null)}
              >
                <option value="">Boxes ({regions.length})</option>
                {regions.map((r, i) => (
                  <option value={r.id} key={r.id}>
                    Box {i + 1} · {r.action}
                  </option>
                ))}
              </ThemedSelect>
            )}
          </div>
        </div>
        {boxes && active && (
          <ImageRegionCard
            key={active.id}
            region={active}
            index={regions.indexOf(active)}
            edit={edit}
            refs={refs}
            images={images}
            onChange={change}
            onRemove={() => remove(active.id)}
            onClose={() => setActiveId(null)}
          />
        )}
        <PromptResizeHandle
          fieldId={mediaId}
          label="image preview"
          min={216}
          max={1200}
          height={() => media.current?.getBoundingClientRect().height ?? 300}
          onResize={setManualHeight}
        />
        <input
          className="sr-only"
          ref={sourceInput}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label="Choose source image"
          onChange={(e) => {
            void images.add(Array.from(e.target.files ?? []), "source");
            e.target.value = "";
          }}
        />
      </div>
      <div className="featured-caption">
        <span>
          {edit
            ? "Drop source → describe edits"
            : boxes
              ? "Drop an image to edit, or draw a new layout"
              : "Describe an image and add references"}
        </span>
        <span>
          {canDraw
            ? "Drag to draw · Shift to overlap · arrows to nudge"
            : "New runs keep references in this browser"}
        </span>
      </div>
    </section>
  );
}
