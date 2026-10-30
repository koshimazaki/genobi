import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { download, type Bundle } from "./bundle";
import { feedbackJson, feedbackOf } from "./feedback-file";
import "./feedback.css";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Feedback for the agent: the person's changes since the agent's revision as
 * Director commands, the open notes and what no command can express, to
 * download as JSON or copy into the agent's conversation. A linked agent
 * reads the same from `genobi_project_feedback`.
 */
export default function FeedbackPanel({
  bundle,
  close,
}: {
  bundle: Bundle;
  close: () => void;
}) {
  const feedback = useMemo(() => feedbackOf(bundle), [bundle]);
  const json = useMemo(() => feedbackJson(feedback), [feedback]);
  const [status, setStatus] = useState("");
  const { commands, notes, unmapped, baseRevision, revision } = feedback;
  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Copied. Paste it to the agent.");
    } catch {
      setStatus("Copy was refused here; use Download JSON.");
    }
  }
  return (
    <aside className="dir-feedback" aria-label="Feedback for the agent">
      <header>
        <span>FEEDBACK FOR THE AGENT</span>
        <button
          className="dir-icon-button"
          onClick={close}
          aria-label="Close feedback"
          title="Close feedback"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <p className="dir-feedback-base">
        {baseRevision === null
          ? "No agent revision yet. It starts with an agent's next command or a bundle an agent wrote, and is not kept for a project over 1 MB."
          : `Your changes since revision ${baseRevision}, the agent's. This is revision ${revision}.`}
      </p>
      <p className="dir-feedback-summary" data-testid="feedback-summary">
        {count(commands.length, "change")} · {count(notes.length, "open note")}{" "}
        · {unmapped.length} unmapped
      </p>
      <div className="dir-feedback-actions">
        <button
          onClick={() =>
            download(
              new Blob([json], { type: "application/json" }),
              `${feedback.projectId}-feedback.json`,
            )
          }
        >
          Download JSON
        </button>
        <button onClick={() => void copy()}>Copy</button>
      </div>
      <p className="dir-feedback-status" role="status">
        {status}
      </p>
      {commands.length > 0 && (
        <ol className="dir-feedback-list" aria-label="Changes as commands">
          {commands.map((c, i) => (
            <li key={i}>
              <code>{c.command.op}</code> {c.label}
            </li>
          ))}
        </ol>
      )}
      {unmapped.length > 0 && (
        <>
          <h3>No command for</h3>
          <ul className="dir-feedback-list" aria-label="Unmapped changes">
            {unmapped.map((u, i) => (
              <li key={i}>
                {u.label}
                <small>{u.reason}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
