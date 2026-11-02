import { answerCopyConflict, useCopyConflict } from "./copy-conflict";
import "./copy-recovery.css";

/** Asks before the person's version replaces an agent's changes. */
export default function CopyConflictQuestion({
  projectId,
}: {
  projectId?: string;
}) {
  const conflict = useCopyConflict();
  if (!conflict || conflict.projectId !== projectId) return null;
  const saved = conflict.kind === "saved-copy";
  return (
    <div
      className={`dir-error dir-conflict${saved ? " dir-copy-recovery" : ""}`}
      role="alert"
    >
      {saved ? (
        <>
          <strong>Saved project found · revision {conflict.revision}</strong>
          <p>
            Genobi opened the existing saved copy. Your earlier version remains
            in Undo until you leave this page. Choose which one to keep.
          </p>
        </>
      ) : (
        <p>
          An agent changed this project while you edited it. Its revision{" "}
          {conflict.revision} is open; your version is in Undo. Put yours back
          over the agent&apos;s changes?
        </p>
      )}
      <div className="dir-conflict-actions">
        <button onClick={() => answerCopyConflict(false)}>
          {saved ? "Keep saved copy" : "Keep the agent's"}
        </button>
        <button
          className={saved ? "dir-copy-recovery-primary" : undefined}
          onClick={() => answerCopyConflict(true)}
        >
          {saved ? "Restore my version" : "Use mine"}
        </button>
      </div>
    </div>
  );
}
