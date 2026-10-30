import ThemedSelect from "../components/ThemedSelect";
import { useRef } from "react";
import { arenaMediaUrl, type Arena, type ArenaSlot } from "../../shared/arena";
import ArenaModelMenu from "./ArenaModelMenu";
import { isTerminal, type Job } from "../../shared/types";
import Icon from "../components/Icon";
import type { EditorAssets } from "../dual-editor/useEditorAssets";
import { acceptsStudioMedia } from "../studio/media-drop";
import { writeArenaDrag } from "./arena-drag";

export function ArenaCard({
  arena,
  slot,
  index,
  preferred,
  busy,
  audio,
  library,
  onAudio,
  onChange,
  onUpload,
  onPrefer,
  onRemove,
  bind,
  onLoaded,
  onError,
  onDropMedia,
  job,
  canRun,
  onRun,
  onEnlarge,
  soloing,
  onSolo,
}: {
  arena: Arena;
  slot: ArenaSlot;
  index: number;
  preferred: boolean;
  busy: boolean;
  audio: boolean;
  library?: EditorAssets;
  onAudio: () => void;
  onChange: (patch: Partial<ArenaSlot>) => void;
  onUpload: (file: File) => void;
  onPrefer: () => void;
  onRemove?: () => void;
  bind: (video: HTMLVideoElement | null) => void;
  onLoaded: () => void;
  onError: (message: string) => void;
  /** A drop from Assets, a project or the desktop, resolved by Arena. */
  onDropMedia: (transfer: DataTransfer) => void;
  /** The approach's latest run, as the queue reads it. */
  job?: Job;
  canRun: boolean;
  onRun: () => void;
  onEnlarge?: () => void;
  /** This result alone is playing; see `useArenaPlayback().solo`. */
  soloing?: boolean;
  onSolo?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const media = arena.media.find((m) => m.hash === slot.media);
  const checking = !!slot.run?.jobId && job?.id !== slot.run.jobId;
  const running = checking || (!!job && !isTerminal(job.status));
  const runState = job
    ? running
      ? `${job.status}${job.progress ? ` · ${Math.round(job.progress * 100)}%` : ""}`
      : job.status === "Ready"
        ? media
          ? ""
          : "Adding result…"
        : job.error || job.status
    : checking
      ? "Checking run status…"
      : "";
  return (
    <article className="arena-card" data-preferred={preferred || undefined}>
      <header>
        <span className="arena-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <strong>{slot.label}</strong>
        <button
          disabled={busy}
          aria-label={`Prefer ${slot.label}`}
          aria-pressed={preferred}
          onClick={onPrefer}
        >
          <Icon name="check" size={14} />
        </button>
      </header>
      <div
        className="arena-screen"
        onDragOver={(e) => {
          if (acceptsStudioMedia(e.dataTransfer.types)) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!acceptsStudioMedia(e.dataTransfer.types)) return;
          e.preventDefault();
          if (!busy) onDropMedia(e.dataTransfer);
        }}
      >
        {media?.kind === "image" ? (
          <img
            key={media.hash}
            src={arenaMediaUrl(arena.id, media.hash)}
            alt={`${slot.label} result`}
            onClick={onEnlarge}
            draggable
            onDragStart={(e) => writeArenaDrag(e.dataTransfer, arena.id, media)}
          />
        ) : media ? (
          <video
            draggable
            onDragStart={(e) => writeArenaDrag(e.dataTransfer, arena.id, media)}
            key={media.hash}
            ref={bind}
            src={arenaMediaUrl(arena.id, media.hash)}
            muted={!audio}
            playsInline
            preload="auto"
            onClick={onEnlarge}
            onLoadedMetadata={onLoaded}
            onError={() =>
              onError(
                `${slot.label} could not load. Replace the clip or reload the comparison.`,
              )
            }
            aria-label={`${slot.label} result`}
          />
        ) : running || (job && job.status !== "Ready") ? (
          <div className="arena-empty arena-run-state" role="status">
            <Icon name="film" size={22} />
            <span>{runState}</span>
            <small>In the studio queue</small>
          </div>
        ) : (
          <button
            className="arena-empty"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="plus" size={22} />
            <span>Add result</span>
            <small>Drop a video or image from Assets</small>
          </button>
        )}
        {media && onEnlarge && (
          <button
            className="arena-enlarge"
            aria-label={`Enlarge ${slot.label}`}
            onClick={onEnlarge}
          >
            <Icon name="expand" size={14} />
          </button>
        )}
        {media?.kind === "video" && onSolo && (
          <button
            className="arena-solo"
            aria-label={`${soloing ? "Pause" : "Play"} ${slot.label} alone`}
            aria-pressed={soloing}
            onClick={onSolo}
          >
            <Icon name={soloing ? "pause" : "play"} size={14} />
          </button>
        )}
        {media?.kind === "video" && (
          <button
            className="arena-audio"
            aria-label={`${audio ? "Mute" : "Listen to"} ${slot.label}`}
            aria-pressed={audio}
            onClick={onAudio}
          >
            <Icon name={audio ? "sound" : "mute"} size={14} />
          </button>
        )}
      </div>
      <div className="arena-caption">
        <span>{slot.model || "Choose model"}</span>
        <span>{(media && runState) || slot.guide || slot.status}</span>
        {slot.run?.entry && (
          <button
            className="arena-run"
            disabled={busy || !canRun}
            onClick={onRun}
          >
            {checking
              ? "Checking status…"
              : running
                ? "Running"
                : media
                  ? "Run again"
                  : "Run"}
          </button>
        )}
      </div>
      <details className="arena-details">
        <summary>
          Prompt & settings <Icon name="chevron" size={14} />
        </summary>
        <fieldset className="arena-fields" disabled={busy}>
          <label>
            Name
            <input
              value={slot.label}
              maxLength={80}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </label>
          <div className="arena-model-field">
            <ArenaModelMenu
              id={`arena-card-model-${slot.id}`}
              slot={slot}
              disabled={busy}
              onChange={onChange}
            />
          </div>
          <label>
            Recorded as
            <input
              value={slot.model}
              maxLength={120}
              placeholder="Model or exact checkpoint"
              onChange={(e) => onChange({ model: e.target.value })}
            />
          </label>
          <label>
            Workflow
            <input
              value={slot.workflow}
              maxLength={160}
              placeholder="Workflow name or version"
              onChange={(e) => onChange({ workflow: e.target.value })}
            />
          </label>
          <label>
            Guide
            <input
              value={slot.guide}
              maxLength={80}
              onChange={(e) => onChange({ guide: e.target.value })}
            />
          </label>
          <label className="arena-wide">
            Prompt override
            <textarea
              value={slot.prompt}
              maxLength={8000}
              placeholder="Use the main prompt"
              onChange={(e) => onChange({ prompt: e.target.value })}
            />
          </label>
          {slot.run?.entry && (
            <div className="arena-wide arena-actions">
              <button
                className="arena-run"
                disabled={busy || !canRun}
                title="Quote this load with its own prompt, or the main prompt when the override is empty, confirm, then run it"
                onClick={onRun}
              >
                {slot.prompt.trim()
                  ? "Generate with this prompt"
                  : "Generate with the main prompt"}
              </button>
            </div>
          )}
          <label className="arena-wide">
            Observation
            <textarea
              value={slot.notes}
              maxLength={3000}
              placeholder="What worked? What drifted?"
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </label>
          <div className="arena-wide arena-facts">
            {media && (
              <span>
                {media.width} × {media.height}
                {media.kind === "video" && ` · ${media.duration.toFixed(2)}s`}
              </span>
            )}
            {slot.gpuSeconds !== undefined && (
              <span>{slot.gpuSeconds.toFixed(2)} GPU s</span>
            )}
            {slot.seed !== undefined && <span>Seed {slot.seed}</span>}
          </div>
          <div className="arena-wide arena-actions">
            <button disabled={busy} onClick={() => input.current?.click()}>
              {media ? "Replace result" : "Upload result"}
            </button>
            {onRemove && (
              <button disabled={busy} onClick={onRemove}>
                Remove approach
              </button>
            )}
          </div>
          {library && (
            <label className="arena-wide">
              From assets
              <ThemedSelect
                disabled={busy}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  void library
                    .resolve(id)
                    .then((file) => {
                      if (file) onUpload(file);
                    })
                    .catch((error) => onError(error.message));
                }}
              >
                <option value="">Choose a video or image…</option>
                {library.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          )}
        </fieldset>
      </details>
      <input
        ref={input}
        hidden
        type="file"
        accept="video/mp4,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </article>
  );
}
