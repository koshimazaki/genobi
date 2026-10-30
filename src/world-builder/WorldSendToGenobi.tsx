import { useEffect, useState } from "react";
import { isAgentActive } from "../../shared/agent-session-events";
import { copyText } from "../agent/send";
import { useLatestAgentSession } from "../agent/useAgentSession";
import { worldPreset } from "../agent/world-context";
import type { Recipe } from "./recipe";
import { worldMessage } from "./world-agent";
import { NO_DIRECTION, sendWorldScene } from "./world-send";

/**
 * Beside the scene direction: hand it, with a summary of the set, to the
 * agent the studio runs (Hermes or Claude), which builds the scene through
 * `genobi_world_recipe` / `genobi_world`. With no session running, the same
 * fallback as the voice panel: a session starts through the spawn dialog,
 * and "Copy" puts the message on the clipboard to use by hand.
 */
export function WorldSendToGenobi({ recipe }: { recipe: Recipe }) {
  const latest = useLatestAgentSession();
  const running = !!latest && isAgentActive(latest.status);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [alert, setAlert] = useState("");
  const empty = !recipe.prompt.trim();
  // A changed direction has not been sent or copied yet.
  useEffect(() => {
    setNote("");
    setAlert("");
  }, [recipe.prompt]);

  async function send() {
    if (busy) return;
    if (empty) return setNote(NO_DIRECTION);
    setBusy(true);
    setAlert("");
    setNote(running ? "Sending to the session…" : "Starting a session…");
    try {
      setNote(
        (await sendWorldScene(recipe.prompt, recipe, worldPreset())) ?? "",
      );
    } catch (error) {
      setNote("");
      setAlert((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    const message = worldMessage(recipe.prompt, recipe, worldPreset());
    if (!message) return setNote(NO_DIRECTION);
    setNote(
      (await copyText(message))
        ? "Copied to the clipboard: the direction, the set and the tools."
        : "The clipboard could not be written. Select the direction and copy it.",
    );
  }

  return (
    <div className="wb-send-genobi">
      <div className="wb-panel-actions">
        <button
          type="button"
          aria-disabled={busy || empty || undefined}
          aria-describedby="wb-send-genobi-note"
          title="The agent builds the scene with Genobi's World tools; nothing is captured or spent"
          onClick={() => void send()}
        >
          Send to Genobi
        </button>
        <button
          type="button"
          disabled={empty}
          title="Put the direction, the set and the tools on the clipboard, to use by hand"
          onClick={() => void copy()}
        >
          Copy
        </button>
      </div>
      <p id="wb-send-genobi-note" className="wb-hint" role="status">
        {note ||
          (running
            ? "Sends to the running session as its next message."
            : "No session is running: Send to Genobi starts one.")}
      </p>
      {alert && (
        <p className="wb-hint" role="alert">
          {alert}
        </p>
      )}
    </div>
  );
}
