import { approvable } from "../../shared/agent-approval";
import { OPEN_DECK, useLatestAgentSession } from "./useAgentSession";

/**
 * A paid step waiting while a modal dialog covers the studio: the deck that
 * holds the approval opens behind the dialog's top layer, where nothing can
 * be clicked. This line, inside the dialog, says so and offers to close the
 * dialog onto the deck. It approves nothing itself.
 */
export function ApprovalWaitingNotice({ close }: { close: () => void }) {
  const session = useLatestAgentSession();
  if (!session?.approvals?.some((a) => approvable(a))) return null;
  return (
    <p className="dir-version-approval" role="status">
      A paid step from your agent is waiting for your approval in the log.{" "}
      <button
        type="button"
        onClick={() => {
          close();
          window.dispatchEvent(new Event(OPEN_DECK));
        }}
      >
        Review approval
      </button>
    </p>
  );
}
