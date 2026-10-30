import type { Project } from "../../shared/director/types";
import { download } from "./bundle";
import { manifestText } from "./manifest";
import Icon from "../components/Icon";
import type { TimeUnits } from "./timecode";

export default function TimelineHeader({
  project,
  busy,
  undoCount,
  undo,
  channelsOpen,
  fold,
  inspectorOpen,
  inspect,
  notesOpen,
  toggleNotes,
  feedbackOpen,
  toggleFeedback,
  units,
  setUnits,
  expanded,
  expand,
}: {
  project: Project;
  busy: boolean;
  undoCount: number;
  undo: () => void;
  channelsOpen: boolean;
  fold: () => void;
  inspectorOpen: boolean;
  inspect: () => void;
  notesOpen: boolean;
  toggleNotes: () => void;
  feedbackOpen: boolean;
  toggleFeedback: () => void;
  units: TimeUnits;
  setUnits: (units: TimeUnits) => void;
  expanded: boolean;
  expand: () => void;
}) {
  return (
    <header className="dir-console-header">
      <strong>Timeline · Automation</strong>
      <span className="dir-spacer" />
      <div className="dir-units" role="group" aria-label="Timeline units">
        {(["frames", "time"] as const).map((u) => (
          <button
            key={u}
            aria-pressed={units === u}
            onClick={() => setUnits(u)}
            title={
              u === "frames"
                ? "Seconds and frames; edits snap to whole frames"
                : "Seconds and milliseconds; edits still snap to whole frames"
            }
          >
            {u === "frames" ? "Frames" : "Time"}
          </button>
        ))}
      </div>
      <button
        className="dir-icon-button"
        aria-label={expanded ? "Shrink timeline" : "Expand timeline"}
        aria-pressed={expanded}
        onClick={expand}
        title="Taller tracks and more of them in view"
      >
        <Icon name="expand" size={14} />
      </button>
      <button
        className="dir-icon-button"
        aria-label={channelsOpen ? "Fold channels" : "Expand channels"}
        aria-expanded={channelsOpen}
        onClick={fold}
        title="Fold / expand channels"
      >
        <Icon name="fold" size={14} />
      </button>
      <button
        className="dir-icon-button"
        aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
        aria-expanded={inspectorOpen}
        onClick={inspect}
        title="Clip inspector"
      >
        <Icon name={inspectorOpen ? "eyeOff" : "eye"} size={14} />
      </button>
      <NotesButton project={project} open={notesOpen} toggle={toggleNotes} />
      <button
        className="dir-feedback-button"
        aria-expanded={feedbackOpen}
        aria-label="Feedback for the agent"
        onClick={toggleFeedback}
        title="Feedback for the agent: your changes since its revision, as Director commands, with your open notes"
      >
        Feedback
      </button>
      <button disabled={busy || !undoCount} onClick={undo}>
        Undo
      </button>
      <button
        disabled={busy}
        onClick={() =>
          download(
            new Blob([manifestText(project)], {
              type: "application/json",
            }),
            "project.json",
          )
        }
      >
        Save JSON
      </button>
    </header>
  );
}

/** Opens the frame notes; the count is the notes still open. */
function NotesButton({
  project,
  open,
  toggle,
}: {
  project: Project;
  open: boolean;
  toggle: () => void;
}) {
  const waiting = (project.notes ?? []).filter((n) => !n.resolved).length;
  return (
    <button
      className="dir-notes-button"
      aria-expanded={open}
      aria-label={`Notes (${waiting} open)`}
      onClick={toggle}
      title="Frame notes: add one at the playhead"
    >
      Notes <small aria-hidden="true">{waiting}</small>
    </button>
  );
}
