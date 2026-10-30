import { useRef, useState } from "react";
import { isH3, videoReferenceLimit } from "../../shared/h3";
import { h3OmniFixed } from "../../shared/h3-hint";
import { isH3Router } from "../../shared/comfy/h3-router";
import type { Source } from "../../shared/types";
import type { ComposerState } from "../useComposer";
import type { ImageReferences } from "../useImageReferences";
import { request } from "../useJobs";
import ImageReferenceTray from "./ImageReferenceTray";
import PromptInput from "./PromptInput";
import SelectMenu from "./SelectMenu";
import "../styles/image-references.css";
import "../styles/video-references.css";

/** Same composer footprint as Image; image and guide inputs stay beside the prompt. */
export default function VideoWorkspace({
  state,
  update,
  images,
  sources,
  apiKey,
  refresh,
  onError,
  onBusy,
  onOpenCamera,
  onOpenAcoustic,
}: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
  images: ImageReferences;
  sources: Source[];
  apiKey: string;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onOpenCamera: () => void;
  onOpenAcoustic: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const current = useRef(state);
  current.current = state;
  const [uploading, setUploading] = useState(false);
  const h3 = isH3(state.model);
  // H3 on Router: the same two slots, no guide video.
  const sheet = isH3Router(state.model);
  const combined = state.model === "minimax-h3-combined";
  const selected = sources.find((s) => s.id === state.sourceId);
  async function upload(file: File) {
    if (inFlight.current) return;
    const origin = current.current;
    inFlight.current = true;
    setUploading(true);
    onBusy(true);
    onError("");
    try {
      if (file.size > 50_000_000 || !file.name.toLowerCase().endsWith(".mp4"))
        throw new Error("Choose an MP4 guide under 50 MB.");
      // Metadata and ownership are established by the server's MP4 reader.
      const query = new URLSearchParams({ filename: file.name });
      const { source } = await request<{ source: Source }>(
        `/api/uploads?${query}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "video/mp4",
            ...(apiKey ? { "x-byo-key": apiKey } : {}),
          },
          body: file,
        },
      );
      await refresh();
      if (
        current.current.model === origin.model &&
        current.current.generator === origin.generator &&
        current.current.sourceId === origin.sourceId
      )
        update({ sourceId: source.id });
      else
        onError(
          "Guide uploaded to the gallery. Select it when you return to H3.",
        );
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "The guide upload failed.",
      );
    } finally {
      inFlight.current = false;
      setUploading(false);
      onBusy(false);
    }
  }
  return (
    <div
      className={`image-workspace video-workspace${h3 ? " video-workspace--h3" : ""}`}
    >
      <PromptInput
        {...state}
        resizable
        onChange={(description) => update({ description })}
        onOpenCamera={onOpenCamera}
        onOpenAcoustic={onOpenAcoustic}
      />
      <div className="video-reference-tray">
        <ImageReferenceTray
          state={state}
          images={images}
          max={videoReferenceLimit(state.model)}
          hint={
            h3
              ? "1 identity · 2 look"
              : sheet
                ? "1 character sheet · 2 storyboard"
                : "Ordered keyframes"
          }
        />
        {h3 && (
          <section
            className="video-guide"
            aria-label="Video reference"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);
            }}
          >
            <SelectMenu
              id="guide-source"
              label="Video guide"
              value={state.sourceId}
              onChange={(sourceId) => update({ sourceId })}
              options={[
                { value: "", label: "Choose guide clip" },
                ...sources.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Drop / add MP4"}
            </button>
            {selected && (
              <span title={selected.label}>
                {selected.width} × {selected.height} ·{" "}
                {selected.duration.toFixed(1)}s
              </span>
            )}
            <input
              hidden
              ref={picker}
              type="file"
              accept="video/mp4,.mp4"
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </section>
        )}
        <details className="video-reference-hint">
          <summary>Reference guide{combined ? " · Test preset" : ""}</summary>
          <p>
            {h3
              ? combined
                ? "Test preset · Video 1 RGB · Video 2 edges · Video 3 depth. Memory and cost not yet measured."
                : `Semantic guidance · ${h3OmniFixed()}`
              : sheet
                ? "Reference to video on Comfy Router · 4–15 s · 768P or 2K. Name both images in the prompt: the first is the character sheet, the second the storyboard."
                : "One image starts the shot; multiple images guide its progression."}
          </p>
        </details>
      </div>
      {images.notice && (
        <p role="status" className="image-notice">
          {images.notice}
        </p>
      )}
    </div>
  );
}
