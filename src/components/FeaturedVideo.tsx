import { isImage } from "../../shared/image";
import type { Job, Source } from "../../shared/types";
import { isTerminal } from "../../shared/types";
import JobMedia, { statusLabel } from "./JobMedia";
import Clip from "./Clip";
import { useState, type ReactNode } from "react";
import VideoLightbox, { type ViewingClip } from "./VideoLightbox";
import Icon from "./Icon";
import { modelSignature } from "../generators";
import { librarySignature } from "../library";
export default function FeaturedVideo({
  job,
  source,
  onRetry,
  review,
  captionAction,
}: {
  job?: Job;
  source?: Source;
  onRetry: (job: Job) => void;
  /** The review step, laid over the media so it never resizes the view. */
  review?: ReactNode;
  captionAction?: ReactNode;
}) {
  const [viewing, setViewing] = useState<ViewingClip | null>(null);
  // The lightbox names the model as the gallery card does; an upload has none.
  const signature = job
    ? modelSignature(job)
    : source && (source.setup || source.model)
      ? librarySignature(source)
      : undefined;
  const url =
    job?.status === "Ready" && job.mediaAvailable !== false
      ? job.resultUrl
      : !job
        ? source?.url
        : undefined;
  return (
    <section
      id="main-video"
      className="featured-video"
      aria-label="Main preview"
    >
      <div className="featured-media">
        {job ? (
          // A finished job gets the same contract as a library clip below:
          // a play button that opens the lightbox, not inline controls.
          <JobMedia
            key={job.id}
            job={job}
            onOpen={
              job.resultUrl && job.generator !== "audio"
                ? () =>
                    setViewing({
                      url: job.resultUrl!,
                      mediaType: isImage(job.generator) ? "image" : "video",
                      contentType: job.resultContentType,
                      label: job.description || "Your latest generation",
                      prompt: job.prompt,
                      signature,
                    })
                : undefined
            }
          />
        ) : source ? (
          // Same contract as a gallery card: hover previews, play opens the
          // lightbox. Passing onOpen is what switches Clip into that mode.
          <Clip
            key={source.id}
            url={source.url}
            poster={source.poster}
            label={source.label}
            onOpen={() =>
              setViewing({
                url: source.url,
                label: source.label,
                prompt: source.setup?.prompt,
                about: source.about,
                signature,
              })
            }
          />
        ) : (
          <div className="job-message">
            <Icon name="play" />
            <p>Your next scene begins here.</p>
          </div>
        )}
        {(job || source) && (
          <span className="clip-badge">
            {job
              ? job.generator !== "upscale"
                ? modelSignature(job).tag
                : "UPSCALED"
              : source && !source.setup && signature
                ? `FROM THE LIBRARY · ${signature.title}`
                : "FROM THE LIBRARY"}
          </span>
        )}
        {url && job?.generator !== "audio" && (
          <button
            className="expand-video icon-button"
            aria-label="Enlarge preview"
            onClick={() =>
              setViewing({
                url,
                contentType: job?.resultContentType,
                mediaType: job && isImage(job.generator) ? "image" : "video",
                label: job?.description || source?.label || "Video",
                // A catalogue clip carries the prompt that produced it.
                prompt: job?.prompt ?? source?.setup?.prompt,
                about: job ? undefined : source?.about,
                signature,
              })
            }
          >
            <Icon name="expand" />
          </button>
        )}
        {review}
      </div>
      <div className="featured-caption">
        <span>
          {job
            ? job.mediaAvailable === false
              ? "Video no longer stored"
              : statusLabel(job.status)
            : source?.label || "Studio preview"}
        </span>
        {captionAction ??
          (job && isTerminal(job.status) && job.status !== "Ready" ? (
            <button className="text-button" onClick={() => onRetry(job)}>
              Edit and try again <Icon name="refresh" size={12} />
            </button>
          ) : (
            <span>
              {job
                ? "Your latest generation"
                : "Make something of your own below"}
            </span>
          ))}
      </div>
      <VideoLightbox clip={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
