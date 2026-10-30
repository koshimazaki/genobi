import { answerCopyConflict, useCopyConflict } from "./copy-conflict";

/** Asks before the person's version replaces an agent's changes. */
export default function CopyConflictQuestion({
  projectId,
}: {
  projectId?: string;
}) {
  const conflict = useCopyConflict();
  if (!conflict || conflict.projectId !== projectId) return null;
  return (
    <div className="dir-error dir-conflict" role="alert">
      An agent changed this project while you edited it. Its revision{" "}
      {conflict.revision} is open; your version is in Undo. Put yours back over
      the agent&apos;s changes?
      <button onClick={() => answerCopyConflict(false)}>
        Keep the agent&apos;s
      </button>
      <button onClick={() => answerCopyConflict(true)}>Use mine</button>
    </div>
  );
}
