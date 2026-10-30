import { useEffect, useRef, useState } from "react";
import type { Job } from "../../shared/types";
import { isTerminal } from "../../shared/types";
import { WaitField } from "./WaitField";
import { isImage } from "../../shared/image";
import StillImage from "./StillImage";
import Clip from "./Clip";
import AudioTake from "./AudioTake";
import { entryFor } from "../../shared/registry";
import { generationProgress } from "../generation-progress";
import { brailleBar } from "../spinner";
import { estimateText, jobStage } from "../../shared/progress-line";
import Spinner from "./Spinner";

export const statusLabel = (status: string) =>
  (
    ({
      submitting: "Sending to provider",
      Pending: "Queued",
      Reasoning: "Planning the scene",
      Generating: "Generating",
      copying: "Saving your result",
      expired: "Result expired",
      stopped: "Cancelled",
      Error: "Could not finish",
      "Request Moderated": "Prompt moderated",
      "Content Moderated": "Result moderated",
    }) as Record<string, string>
  )[status] || status;

export default function JobMedia({
  job,
  onOpen,
}: {
  job: Job;
  /** Passing this gives a finished job the same contract as a library clip:
   * a play button that opens the lightbox rather than inline controls. */
  onOpen?: () => void;
}) {
  const Media = isImage(job.generator) ? StillImage : Clip;
  const arrivedHere = useRef(job.status !== "Ready");
  const [decoded, setDecoded] = useState(false);
  const [revealed, setRevealed] = useState(!arrivedHere.current);
  const [mediaError, setMediaError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const waiting = !isTerminal(job.status);
  const progress = generationProgress(job);
  const unavailable = job.status === "Ready" && job.mediaAvailable === false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  return (
    <div className="job-placeholder">
      {!unavailable &&
        job.status === "Ready" &&
        job.resultUrl &&
        (job.generator === "audio" ? (
          // A song keeps the credit its model's licence asks for.
          <AudioTake
            key={attempt}
            url={job.resultUrl}
            label={job.description || "Your latest generation"}
            credit={entryFor(job.generator, job.model).credit}
            onReady={() => setDecoded(true)}
            onError={() => setMediaError(true)}
          />
        ) : (
          <Media
            // Remounting is how "Reload result" retries: one element, one source.
            key={attempt}
            url={job.resultUrl}
            label={job.description || "Your latest generation"}
            // The reveal waits on the first frame, which metadata alone is not.
            preload="auto"
            onReady={() => setDecoded(true)}
            onError={() => setMediaError(true)}
            onOpen={onOpen}
          />
        ))}
      {!unavailable &&
        (waiting || (!revealed && !mediaError && job.status === "Ready")) && (
          <WaitField
            active={waiting || !decoded}
            onDone={() => setRevealed(true)}
          />
        )}
      {(waiting || job.status !== "Ready" || mediaError || unavailable) && (
        <div className="job-message" role="status">
          {!waiting && <span className="status-dot" />}
          {!waiting && (
            <strong>
              {unavailable
                ? "Result no longer stored"
                : mediaError
                  ? "Result could not load"
                  : statusLabel(job.status)}
            </strong>
          )}
          <p>
            {mediaError && !unavailable
              ? "Your saved result is still available. Try loading it again."
              : job.error ||
                (job.status === "copying"
                  ? "Your result is almost ready."
                  : job.generator === "upscale"
                    ? "Bringing out the finer details."
                    : job.generator === "audio"
                      ? "Your track is taking shape."
                      : "Your scene is taking shape.")}
          </p>
          {waiting && (
            // The spinner says the job is alive; the bar appears only for
            // real progress from the provider, never as a stand-in for one.
            <div
              className="job-terminal"
              {...(progress !== undefined && {
                role: "progressbar",
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": Math.round(progress * 100),
                "aria-label": statusLabel(job.status),
              })}
            >
              <Spinner name="dots12" />
              <span className="job-terminal-status">{jobStage(job)}</span>
              {progress !== undefined && (
                <>
                  <span>{Math.round(progress * 100)}%</span>
                  <span className="braille-bar">
                    {brailleBar(progress, 24)}
                  </span>
                </>
              )}
            </div>
          )}
          {waiting && (
            <span className="elapsed">
              {Math.max(
                0,
                Math.floor((now - new Date(job.createdAt).getTime()) / 1000),
              )}
              s elapsed ·{" "}
              {progress === undefined && estimateText(job.estimate)
                ? `${estimateText(job.estimate)} · `
                : ""}
              {job.keyMode === "byo"
                ? "keep this tab open to save your result"
                : "you can keep exploring"}
            </span>
          )}
          {mediaError && !unavailable && (
            <button
              className="text-button"
              onClick={() => {
                setMediaError(false);
                setAttempt((value) => value + 1);
              }}
            >
              Reload result
            </button>
          )}
        </div>
      )}
    </div>
  );
}
