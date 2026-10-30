import { useEffect } from "react";
import { clipPromptInstruction } from "../../shared/director/prompt-send";
import { studioStore } from "../studio/store";
import {
  clock,
  markClipsSent,
  setClipNote,
  useClipSend,
} from "./clip-send-store";
import { NO_COPY } from "./regenerate";
import { useAgentSend } from "./useAgentSend";
import "./regenerate.css";

/** Said when the clip inspector's Send is pressed over an empty Prompt. */
export const EMPTY_CLIP_PROMPT =
  "Write this clip's prompt first, then send it to Genobi.";
/** Said instead when the clip is locked, so its Prompt cannot be written. */
export const LOCKED_CLIP_PROMPT =
  "Unlock this clip to write its prompt, then send it to Genobi.";

/**
 * The clip inspector's Send to Genobi, beside its heading: Regenerate's Send
 * (`regenerate.ts`) with this clip's prompt, typed directions, place and
 * source as the instruction, and the global prompt as shared context
 * (`clipPromptInstruction`). Pressing it takes focus from the Prompt field,
 * whose blur commits the words, so the project holds them when they are
 * read. Nothing here quotes or submits a generation: the agent quotes each
 * paid step for the person to approve in the bubble.
 */
export function ClipSendButton({
  projectId,
  layerId,
  locked,
  disabled,
}: {
  projectId: string;
  layerId: string;
  /** A locked clip's Prompt is read-only; one with words still sends. */
  locked: boolean;
  disabled: boolean;
}) {
  const { send, sending, note, setNote, copy, working, label } = useAgentSend();
  // The outcome shows under the Prompt field (`ClipSendStatus`).
  useEffect(() => {
    if (note) setClipNote(projectId, layerId, note);
  }, [note, projectId, layerId]);
  // A studio with no project copy: the reason shows under the Prompt, since
  // a disabled button's tooltip is not reliably shown.
  useEffect(() => {
    if (copy === false) setClipNote(projectId, layerId, { text: NO_COPY });
  }, [copy, projectId, layerId]);
  const title = working
    ? "Genobi is still working on this project; its progress is in the bubble"
    : copy === false
      ? NO_COPY
      : (label.hint ??
        `Send this clip's prompt and directions to Genobi${label.runner ? ` (${label.runner})` : ""}`);
  return (
    <button
      type="button"
      className={`dir-primary dir-agent-action dir-clip-send${working ? " is-generating" : ""}`}
      aria-busy={working}
      disabled={disabled || sending || copy === false}
      title={title}
      onClick={async () => {
        const project = studioStore.getState().director.bundle?.project;
        const instruction = project
          ? clipPromptInstruction(project, layerId)
          : "";
        if (!instruction)
          return setNote({
            text: locked ? LOCKED_CLIP_PROMPT : EMPTY_CLIP_PROMPT,
            alert: true,
          });
        const prompt = project!.layers.find((l) => l.id === layerId)?.prompt;
        if (await send(instruction))
          markClipsSent(projectId, [{ id: layerId, prompt }]);
      }}
    >
      {sending ? "Sending…" : label.button}
    </button>
  );
}

/**
 * Under the clip's Prompt field: when this page last sent the clip to Genobi
 * (from here or with the Global prompt's Send), whether the words changed
 * since, the last Send's refusal, and why Send is off on a studio that keeps
 * no project copy. The field stays editable; sending again
 * sends the new words.
 */
export function ClipSendStatus({
  projectId,
  layerId,
  prompt,
}: {
  projectId: string;
  layerId: string;
  prompt: string;
}) {
  const sent = useClipSend(projectId, layerId);
  if (!sent) return null;
  const { sentAt, sentWords, note } = sent;
  const edited = sentAt && (sentWords ?? "") !== prompt;
  return (
    <>
      {note && !note.alert && !sentAt && (
        <p className="dir-clip-send-note" role="status" title={note.text}>
          {note.text}
        </p>
      )}
      {note?.alert && (
        <p className="dir-clip-send-note" role="alert" title={note.text}>
          {note.text}
        </p>
      )}
      {sentAt && (
        <p
          className="dir-clip-send-note"
          role="status"
          title={note && !note.alert ? note.text : undefined}
        >
          Sent to Genobi · {clock(sentAt)}
          {edited ? " · edited since" : ""}
        </p>
      )}
    </>
  );
}
