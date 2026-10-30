/**
 * "Send to Genobi" from World Builder (issues #18, #23): the scene direction
 * and the current set go to the running agent session as its next message,
 * or start one through the studio's one spawn action, exactly as the voice
 * panel's "Send to agent" does (`sendToGenobi`). A session that takes no
 * further message gets the words on the clipboard. Nothing captures, renders
 * or spends here; the agent's paid steps still wait for approval.
 */
import { copiedText, sendToGenobi, type SendDeps } from "../agent/send";
import { runnerName } from "../voice/agent-client";
import type { Recipe } from "./recipe";
import { worldMessage } from "./world-agent";

export const NO_DIRECTION = "Write or dictate a scene direction first.";

/**
 * Sends the scene; the sentence to show, or undefined when the person closed
 * the spawn dialog. Throws an Error whose message is safe to show.
 */
export async function sendWorldScene(
  prompt: string,
  recipe: Recipe,
  preset?: string,
  deps?: Partial<SendDeps>,
): Promise<string | undefined> {
  const message = worldMessage(prompt, recipe, preset);
  if (!message) return NO_DIRECTION;
  const result = await sendToGenobi({ prompt: message, source: "typed" }, deps);
  switch (result.kind) {
    case "closed":
      return undefined;
    case "sent":
      return `Sent to the running ${runnerName(result.session.runner)} session. It changes the scene through Genobi; capture stays yours.`;
    case "copied":
      return copiedText(result.copied);
    case "started":
      return `Session started with ${runnerName(result.session.runner)} on this scene.`;
  }
}
