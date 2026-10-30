// The person's Approve and Decline of a paid step a session quoted
// (server/agent-sessions.ts; docs/agent-approvals.md).
import { approve, decline, type ApprovalService } from "./agent-approvals";
import { noteResult } from "./agent-results";
import { viewOf } from "./agent-session-end";
import type { Running } from "./agent-session-types";
import { AppError } from "./errors";

function service(approvals?: ApprovalService) {
  if (!approvals)
    throw new AppError(
      503,
      "Approvals are not available.",
      "agent_unavailable",
    );
  return approvals;
}

/** The person's Approve: the quoted run, once, in their own session. */
export async function approveStep(
  session: Running,
  approvals: ApprovalService | undefined,
  owner: string,
  quoteId: string,
  idempotencyKey: string,
) {
  const jobs = service(approvals);
  const step = session.approvals.find((p) => p.view.quoteId === quoteId);
  try {
    const job = await approve(
      session.approvals,
      quoteId,
      owner,
      idempotencyKey,
      jobs,
    );
    return { session: viewOf(session), job };
  } finally {
    // Kept apart from the six visible steps, so a step another quote
    // pushes out still tells recovery where its run is.
    if (step) noteResult(session, step.view);
  }
}

/** The person's Decline: the step declined and its quote voided. */
export async function declineStep(
  session: Running,
  approvals: ApprovalService | undefined,
  quoteId: string,
) {
  await decline(session.approvals, quoteId, service(approvals));
  return viewOf(session);
}
