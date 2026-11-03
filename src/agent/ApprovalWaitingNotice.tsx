import { approvable } from "../../shared/agent-approval";
import { AgentApprovals } from "./AgentApprovals";
import { showAgentSession, useLatestAgentSession } from "./useAgentSession";
import "./agent.css";

/**
 * A paid step waiting while a modal dialog covers the studio: the deck that
 * holds the approval sits behind the dialog's top layer, where nothing can
 * be clicked. So the same approval card (plan, price, payer, Approve and
 * Decline, `AgentApprovals`) renders inside the dialog, and the person
 * answers it without closing the dialog or losing its unsaved edits. Each
 * answer is the person's own click; it goes back through `showAgentSession`
 * as the deck's does.
 */
export function ApprovalWaitingNotice() {
  const session = useLatestAgentSession();
  if (!session?.approvals?.some((a) => approvable(a))) return null;
  return (
    <section
      className="dir-version-approval"
      aria-label="Paid step waiting for your approval"
    >
      <p>
        A paid step from your agent is waiting for your approval. Your edits
        here stay as they are.
      </p>
      <AgentApprovals session={session} onChange={showAgentSession} />
    </section>
  );
}
