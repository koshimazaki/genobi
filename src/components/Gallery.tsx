import { useShell } from "../studio/ShellContext";
import { resultExtension } from "../image-download";
import { isTerminal } from "../../shared/types";
import { useState } from "react";
import type { Generator, Job, Source, VideoModel } from "../../shared/types";
import { isImage } from "../../shared/image";
import Clip from "./Clip";
import ClipActions from "./ClipActions";
import VideoLightbox, { type ViewingClip } from "./VideoLightbox";
import Icon from "./Icon";
import JobMedia, { statusLabel } from "./JobMedia";
import DeploymentLink from "./DeploymentLink";
import ModelTag from "./ModelTag";
import ChainCard from "./ChainCard";
import type { ChainEntry } from "../chain-state";
import { modelSignature } from "../generators";
import { notePick, takePick } from "../agent/studio-context";
import { libraryMatchesMode, librarySignature } from "../library";
/** Where a shared take came from (`server/shared-takes.ts`). */
export const originLabel = (job: Pick<Job, "origin">) =>
  job.origin === "terminal" ? "From terminal" : "From agent";

export default function Gallery({
  jobs,
  sources,
  generator = "video",
  model,
  onUpscale,
  onEditImage,
  onRetry,
  onSelect,
  onLibrarySetup,
  onHide,
  hiddenCount,
  onRestoreHidden,
  chains = [],
  onReviewChain,
}: {
  jobs: Job[];
  sources: Source[];
  generator?: Generator;
  model?: VideoModel;
  onUpscale: (id: string) => void;
  onEditImage?: (job: Job) => void;
  onRetry: (job: Job) => void;
  onSelect: (id: string) => void;
  /** Loads a catalogue clip's recorded run: the whole setup, or its prompt only. */
  onLibrarySetup: (source: Source, full: boolean) => void;
  onHide: (id: string) => void;
  hiddenCount: number;
  onRestoreHidden: () => void;
  /** Chains this page started or still open: Fast runs and Studio reviews. */
  chains?: ChainEntry[];
  onReviewChain?: (id: string) => void;
}) {
  const shell = useShell();
  const inRail = !!shell && !["camera", "ninja"].includes(shell.preset);
  const [viewing, setViewing] = useState<ViewingClip | null>(null);
  const [filter, setFilter] = useState<"all" | "session">("all");
  const generated = new Set(jobs.map((j) => j.resultUrl).filter(Boolean));
  const library = sources.filter(
    (s) =>
      s.origin === "sample" &&
      !generated.has(s.url) &&
      libraryMatchesMode(s, generator, model),
  );
  // "This session" leaves out takes a terminal or an agent made elsewhere.
  const shown = filter === "all" ? jobs : jobs.filter((job) => !job.shared);
  const visibleCount = shown.length + (filter === "all" ? library.length : 0);
  return (
    <section className="gallery" aria-label="Generation gallery">
      <header className="gallery-heading">
        <div>
          <h2>
            {inRail ? "Library" : "Your generations"}
            <span>
              {visibleCount > 0 ? String(visibleCount).padStart(2, "0") : ""}
            </span>
          </h2>
        </div>
        <div className="gallery-filters" aria-label="Gallery filter">
          {hiddenCount > 0 && (
            <button onClick={onRestoreHidden}>
              Restore hidden ({hiddenCount})
            </button>
          )}
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All media
          </button>
          <button
            className={filter === "session" ? "active" : ""}
            onClick={() => setFilter("session")}
          >
            This session
          </button>
        </div>
      </header>
      <div className="gallery-grid">
        {onReviewChain &&
          chains.map((entry) => (
            <ChainCard
              key={entry.chain.id}
              entry={entry}
              onReview={onReviewChain}
            />
          ))}
        {shown.map((job) => (
          <article
            className="clip-card"
            key={job.id}
            draggable={
              job.generator !== "audio" &&
              !!sources.find((s) => s.url === job.resultUrl)
            }
            onDragStart={(e) => {
              const source = sources.find((s) => s.url === job.resultUrl);
              if (source) {
                e.dataTransfer.setData(
                  "application/x-director-video",
                  `director:${source.id}`,
                );
                e.dataTransfer.effectAllowed = "copy";
              } else e.preventDefault();
            }}
          >
            <div className="clip-media">
              {/* Available while a run is in flight too: hiding is a view
                  filter, so the poller keeps collecting and saving it. */}
              <button
                className="clip-hide-button"
                onClick={() => onHide(job.id)}
                aria-label={`Hide ${job.description || "untitled study"}`}
                title="Hide from this browser gallery"
              >
                <Icon name="close" size={14} />
              </button>
              {job.status === "Ready" &&
              job.mediaAvailable !== false &&
              job.resultUrl &&
              job.generator !== "audio" ? (
                <JobMedia
                  job={job}
                  onOpen={() =>
                    setViewing({
                      url: job.resultUrl!,
                      mediaType: isImage(job.generator) ? "image" : "video",
                      contentType: job.resultContentType,
                      label: job.description || "Untitled study",
                      prompt: job.prompt,
                      signature: modelSignature(job),
                    })
                  }
                />
              ) : (
                <JobMedia job={job} />
              )}
              {job.shared && (
                <span className="clip-badge clip-origin">
                  {originLabel(job)}
                </span>
              )}
            </div>
            <div className="clip-info">
              <h3>
                <button
                  className="clip-title-button"
                  title={
                    isImage(job.generator)
                      ? "Switch to image and use this prompt; reattach references if needed"
                      : job.generator === "audio"
                        ? "Switch to music and use this caption and lyrics; keep the length"
                        : job.generator === "video"
                          ? "Switch to video and use this prompt and camera direction; keep output settings"
                          : "Switch to upscale and use this prompt; keep output settings"
                  }
                  onClick={() => {
                    notePick(takePick(job));
                    onSelect(job.id);
                  }}
                >
                  {job.description || "Untitled study"}
                </button>
              </h3>
              {job.deployment && <DeploymentLink deployment={job.deployment} />}
              {job.companions?.map((file) => (
                <a key={file.url} href={file.url} download>
                  {file.label}
                </a>
              ))}
              <div className="clip-meta">
                <span className="clip-facts">
                  <ModelTag {...modelSignature(job)} />
                  {isImage(job.generator)
                    ? (job.imageResolution ?? "1k").toUpperCase()
                    : `${job.duration}s`}
                </span>
                {job.status === "Ready" &&
                job.mediaAvailable !== false &&
                job.resultUrl ? (
                  <ClipActions
                    url={job.resultUrl}
                    filename={`genobi-study-${job.id}.${resultExtension(job)}`}
                    onRecreate={() => onRetry(job)}
                    onEdit={
                      isImage(job.generator) && onEditImage
                        ? () => onEditImage(job)
                        : undefined
                    }
                    onUpscale={
                      job.generator === "video"
                        ? () => {
                            const source = sources.find(
                              (s) => s.url === job.resultUrl || s.id === job.id,
                            );
                            if (source) onUpscale(source.id);
                          }
                        : undefined
                    }
                  />
                ) : isTerminal(job.status) ? (
                  <button onClick={() => onRetry(job)}>
                    {job.status === "Ready" ? "Recreate" : "Try again"}{" "}
                    <Icon name="refresh" size={12} />
                  </button>
                ) : null}
              </div>
              {(job.status !== "Ready" || job.mediaAvailable === false) && (
                <p className="clip-status">
                  {job.mediaAvailable === false
                    ? "Result no longer stored"
                    : statusLabel(job.status)}
                </p>
              )}
            </div>
          </article>
        ))}
        {filter === "all" &&
          library.map((source, index) => (
            <article
              className="clip-card"
              key={source.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/x-director-video",
                  `director:${source.id}`,
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <div className="clip-media">
                <Clip
                  url={source.preview ?? source.url}
                  poster={source.previewPoster ?? source.poster}
                  label={source.label}
                  onOpen={() =>
                    setViewing({
                      url: source.url,
                      label: source.label,
                      prompt: source.setup?.prompt,
                      about: source.about,
                      signature: librarySignature(source),
                    })
                  }
                />
                <span className="clip-badge">
                  LIBRARY / {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="clip-info">
                <h3 title={source.about}>
                  {source.setup ? (
                    <button
                      className="clip-title-button"
                      title="Switch to video and use this clip's prompt and camera direction; keep output settings"
                      onClick={() => onLibrarySetup(source, false)}
                    >
                      {source.label}
                    </button>
                  ) : (
                    source.label
                  )}
                </h3>

                <div className="clip-meta">
                  <span className="clip-facts">
                    <ModelTag {...librarySignature(source)} />
                    {Number(source.duration.toFixed(1))}s
                  </span>
                  <ClipActions
                    url={source.url}
                    filename={`${source.id}.mp4`}
                    onRecreate={
                      source.setup
                        ? () => onLibrarySetup(source, true)
                        : undefined
                    }
                    onUpscale={() => onUpscale(source.id)}
                  />
                </div>
              </div>
            </article>
          ))}
      </div>
      {shown.length === 0 &&
        chains.length === 0 &&
        (filter === "session" || library.length === 0) && (
          <div className="gallery-empty">
            <Icon name="grid" size={24} />
            <h3>
              {filter === "all"
                ? "No examples for this mode yet."
                : "A space for what comes next."}
            </h3>
            <p>
              Your generations will appear here. Changing models keeps your
              session results.
            </p>
          </div>
        )}
      {filter === "all" && library.length > 0 && (
        <p className="gallery-footnote" id="library-recreate-note">
          Your saved clips stay available after refresh in this browser.
          Download to keep a copy. Library clips are existing generations;
          Recreate loads the saved prompt and settings where a clip has them.
        </p>
      )}
      <VideoLightbox clip={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
