import { promptsInstruction } from "../../shared/director/prompt-send";
import { studioStore } from "../studio/store";
import { markClipsSent } from "./clip-send-store";
import { feedbackOf } from "./feedback-file";
import { NO_COPY } from "./regenerate";
import { useAgentSend } from "./useAgentSend";
import "./regenerate.css";

/** Said when Send is pressed with no global prompt and no clip prompt. */
export const EMPTY_GLOBAL_PROMPT =
  "Write the global prompt or a clip's prompt first, then send it to Genobi.";

/**
 * The Global prompt's own Send to Genobi: exactly Regenerate's Send
 * (`regenerate.ts`) with the project's direction as the instruction
 * (`promptsInstruction`): the global prompt, and the clip prompts the
 * person's edits do not already carry, so a project directed clip by clip
 * sends too. The field commits on blur, which pressing this button causes,
 * so the project already holds the words when it reads them. Nothing here
 * quotes or submits a generation.
 */
export default function GlobalPromptSend({ disabled }: { disabled: boolean }) {
  const { send, sending, note, setNote, copy, working, label } = useAgentSend();
  const shown =
    note ??
    (copy === false
      ? { text: NO_COPY }
      : label.hint
        ? { text: label.hint }
        : undefined);
  return (
    <div className="dir-global-send">
      {shown && (
        <p
          className="dir-global-send-note"
          role={shown.alert ? "alert" : "status"}
          title={shown.text}
        >
          {shown.text}
        </p>
      )}
      <button
        type="button"
        className={`dir-primary dir-agent-action${working ? " is-generating" : ""}`}
        aria-busy={working}
        disabled={disabled || sending || copy === false}
        title={
          working
            ? "Genobi is still working on this project; its progress is in the bubble"
            : `Send the global prompt, the clip prompts and your edits to Genobi${label.runner ? ` (${label.runner})` : ""}`
        }
        onClick={async () => {
          const bundle = studioStore.getState().director.bundle;
          const out = bundle
            ? promptsInstruction(bundle.project, feedbackOf(bundle))
            : { text: "", clipIds: [] };
          if (!out.text)
            return setNote({ text: EMPTY_GLOBAL_PROMPT, alert: true });
          if (await send(out.text))
            markClipsSent(
              bundle!.project.id,
              bundle!.project.layers.filter((l) => out.clipIds.includes(l.id)),
            );
        }}
      >
        {sending ? "Sending…" : label.button}
      </button>
    </div>
  );
}
