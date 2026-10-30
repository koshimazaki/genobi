import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { copyEdit } from "./lossless-export";
import { renderEdit } from "./timeline-export";
import { saveBlob } from "./export-frame";
import { exportResolution, type MixedSizing } from "./export-resolution";
import type { TimelineSession } from "./useTimeline";
import ExportResolutionNotice from "./ExportResolutionNotice";

export default function TimelineExport({
  session: s,
  onStart,
  onBusy,
}: {
  session: TimelineSession;
  onStart: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState("copy");
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [sizing, setSizing] = useState<MixedSizing>("native");
  const [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null),
    running = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const locked = s.busy || progress !== null;
  const info = exportResolution(
    s.clips,
    new Map([...s.sources].map(([id, source]) => [id, source.engine])),
    sizing,
  );
  async function exportVideo() {
    if (locked || running.current) return;
    running.current = true;
    onStart();
    onBusy(true);
    setProgress(0);
    s.setMessage("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const blob =
        mode === "copy"
          ? await copyEdit(
              s.clips,
              s.sources,
              format,
              abort.signal,
              setProgress,
            )
          : await renderEdit(
              s.clips,
              s.sources,
              format,
              abort.signal,
              setProgress,
              sizing,
            );
      abort.signal.throwIfAborted();
      await saveBlob(
        blob,
        `dual-editor-${mode === "copy" ? "lossless" : "teaser"}.${format}`,
      );
      s.setMessage(
        mode === "copy"
          ? "Exported losslessly · original compressed picture, sound and frame timing; no re-encoding."
          : `Exported ${info!.width} × ${info!.height} · ${info!.frameRate} fps · high-quality re-encode (lossy).`,
      );
    } catch (error) {
      s.setMessage(
        abort.signal.aborted
          ? "Export cancelled. Your edit is preserved."
          : (error as Error).message,
      );
    } finally {
      running.current = false;
      setProgress(null);
      onBusy(false);
    }
  }
  return (
    <footer className="de-timeline-export">
      <ExportResolutionNotice
        clips={s.clips}
        sources={s.sources}
        copy={mode === "copy"}
        sizing={sizing}
      />
      <div className="de-options">
        <ThemedSelect
          aria-label="Video export quality"
          value={mode}
          disabled={locked}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="copy">Lossless · source copy</option>
          <option value="encode">Native exact cuts · re-encode</option>
        </ThemedSelect>
        {mode !== "copy" && info?.mixed && (
          <ThemedSelect
            aria-label="Mixed resolution sizing"
            value={sizing}
            disabled={locked}
            onChange={(e) => setSizing(e.target.value as MixedSizing)}
          >
            <option value="native">Keep native size · pad</option>
            <option value="fit">Scale to fit</option>
          </ThemedSelect>
        )}
        <ThemedSelect
          aria-label="Video export format"
          value={format}
          disabled={locked}
          onChange={(e) => setFormat(e.target.value as "mp4" | "webm")}
        >
          <option value="mp4">
            {mode === "copy" ? "MP4 · original codecs" : "MP4 · H.264 / AAC"}
          </option>
          <option value="webm">
            {mode === "copy" ? "WebM · original codecs" : "WebM · VP8 / Opus"}
          </option>
        </ThemedSelect>
        <button
          className="de-button de-button--primary"
          disabled={locked || !s.clips.length}
          onClick={() => void exportVideo()}
        >
          {progress === null
            ? "Export video ↓"
            : `Exporting ${Math.round(progress * 100)}%`}
        </button>
        {progress !== null && (
          <button
            className="de-button"
            onClick={() => controller.current?.abort()}
          >
            Cancel
          </button>
        )}
      </div>
    </footer>
  );
}
