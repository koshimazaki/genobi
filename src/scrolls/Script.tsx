import { useState } from "react";
import { SendToDirector } from "../studio/SendToDirector";
import { REGENERATE_INSTRUCTION_MAX } from "../../shared/director/regenerate";
import { setDirectorPrompt } from "./director-prompt";
import type { useAgentFill } from "./useAgentFill";
import type { useScrolls } from "./useScrolls";
import "./script.css";

/**
 * The Script: a plain text scroll of what the person wants in the video.
 * **Use as Director prompt** makes it the project's main prompt without
 * opening the Director; **Describe the video → Send** asks Genobi to fill
 * the storyboard panels, which the person then edits and generates.
 */
export function ScrollScript({
  s,
  agent,
}: {
  s: ReturnType<typeof useScrolls>;
  agent: ReturnType<typeof useAgentFill>;
}) {
  const d = s.bundle.document;
  const [description, setDescription] = useState("");
  const script = d.script ?? "";
  return (
    <div className="scroll-workbench">
      <div className="scroll-paper scroll-script" data-kind="script">
        <div className="scroll-paper-heading">
          <strong>{d.name}</strong>
          <span>SCRIPT / {script.length} OF 4000</span>
        </div>
        <textarea
          aria-label="Script"
          className="scroll-script-text"
          value={script}
          maxLength={4000}
          disabled={s.busy}
          placeholder="Write what happens in the video, in your own words: who, where, what happens first, what happens next, how it ends."
          onChange={(e) => s.edit({ op: "brief", script: e.target.value })}
        />
        <div className="scroll-script-actions">
          <SendToDirector
            label="Use as Director prompt"
            disabled={s.busy || !script.trim()}
            act={async () => setDirectorPrompt(script)}
          />
        </div>
        <section
          className="scroll-script-fill"
          aria-label="Fill the panels with Genobi"
        >
          <label htmlFor="scroll-describe">Describe the video</label>
          <p>
            Genobi fills the {d.cells.length} panels (what happens when) from
            your words and the references you picked. You edit them, then press
            Generate board. It spends nothing; any paid step waits for your
            approval.
          </p>
          <textarea
            id="scroll-describe"
            value={description}
            maxLength={REGENERATE_INSTRUCTION_MAX}
            placeholder="Leave empty to send the script (its first 1,500 characters)."
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            disabled={agent.sending || !(description.trim() || script.trim())}
            onClick={() =>
              void (description.trim()
                ? agent.send(description)
                : agent.send(script, true))
            }
          >
            {agent.sending ? "Sending…" : "Send"}
          </button>
          {agent.status && <p role="status">{agent.status}</p>}
        </section>
      </div>
    </div>
  );
}
