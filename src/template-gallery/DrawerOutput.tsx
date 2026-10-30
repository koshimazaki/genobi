import { jobProgressLine } from "../../shared/progress-line";
import type { galleryMedia } from "../../shared/gallery/catalogue";
import type { HouseTemplate } from "../../shared/templates/types";
import { GenobiMark } from "../components/GenobiMark";
import { UNCERTAIN } from "./mechanical-run";
import { CHECK_HISTORY } from "./pending-runs";
import type { MechanicalRun } from "./useMechanicalRun";

/**
 * The drawer's output, one fixed box for every state so nothing below it
 * moves: the example's video when there is one (or "Preview coming soon",
 * never stand-in footage presented as a result), then for a mechanical run
 * its progress, its result to play, or why it stopped.
 */
export default function DrawerOutput({
  template,
  media,
  run,
}: {
  template: HouseTemplate;
  media: ReturnType<typeof galleryMedia>;
  run?: MechanicalRun;
}) {
  const job = run?.job;
  const result =
    job?.status === "Ready" && job.resultUrl && job.mediaAvailable !== false
      ? job.resultUrl
      : undefined;
  let line = "";
  if (run?.check) line = CHECK_HISTORY;
  else if (run?.pending?.state === "uncertain") line = UNCERTAIN;
  else if (run?.pending?.state === "submitting") line = "Sending the run…";
  else if (job && run?.running) line = jobProgressLine(job, run.now);
  else if (job && !result)
    line =
      job.status === "Ready"
        ? "The result is no longer available."
        : `The run ended: ${job.error || job.status}.`;
  return (
    <div className="branded-preview template-output">
      <div className="template-output-frame">
        {result ? (
          <video
            key={result}
            src={result}
            controls
            playsInline
            preload="metadata"
            aria-label={`Your ${template.name} result`}
          />
        ) : media ? (
          <video
            key={media.video}
            src={media.video}
            poster={media.poster}
            controls={!line}
            playsInline
            preload="metadata"
            aria-label={`${template.name} preview`}
          />
        ) : (
          <span className="template-output-empty">Preview coming soon</span>
        )}
        {line && (
          <p className="template-output-line" role="status">
            {line}
          </p>
        )}
      </div>
      <div>
        <GenobiMark />
        <span>
          {result
            ? "Your result"
            : media?.demo
              ? "Preview footage"
              : template.generation
                ? "Made with FLUX 3"
                : "Genobi"}
        </span>
      </div>
    </div>
  );
}
