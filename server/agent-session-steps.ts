// The person's Approve and Decline of a paid step a session quoted
// (server/agent-sessions.ts; docs/agent-approvals.md).
import type { ApprovalPayer } from "../shared/agent-approval";
import type { Quote } from "../shared/quote";
import type { GenerateInput } from "../shared/types";
import {
  approve,
  decline,
  propose,
  type ApprovalService,
  type SetSource,
} from "./agent-approvals";
import { noteResult } from "./agent-results";
import { pushLine, viewOf } from "./agent-session-end";
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

/**
 * A quote the running session's Genobi MCP server took becomes a step for
 * the person, with a line saying what it would cost.
 */
export function proposeStep(
  session: Running,
  input: GenerateInput,
  quote: Quote,
  quoteSession: string,
  payer: () => ApprovalPayer,
  source: SetSource | undefined,
  sourceSession: string,
) {
  try {
    session.approvals = propose(
      session.approvals,
      input,
      quote,
      quoteSession,
      payer(),
      source,
      sourceSession,
    );
  } catch (error) {
    // Too many steps in flight: said in the session, nothing dropped.
    if (error instanceof AppError) pushLine(session, error.message);
    // Nobody can pay, or an upscale without its measured source: no step.
    return;
  }
  pushLine(
    session,
    quote.billing
      ? `A paid step is waiting for your approval: ${quote.billing}${quote.recipe.deployment ? ` (${quote.recipe.deployment.name})` : ""}.`
      : `A paid step is waiting for your approval: about $${quote.estimateUsd.toFixed(2)}.`,
  );
}
