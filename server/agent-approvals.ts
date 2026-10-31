// Confirm before spending (issue #23): a quote an agent session takes becomes
// a step the person approves or declines in their own studio. Approval runs
// the quoted submission once, in the person's session, through the job
// service's own quote and idempotency checks; nothing is retried. Local
// server only, in memory with the session.
import {
  APPROVALS_MAX,
  approvalPlan,
  type AgentApproval,
  type ApprovalPayer,
  type MeasuredSource,
} from "../shared/agent-approval";
import type { Quote } from "../shared/quote";
import type { GenerateInput, Job } from "../shared/types";
import { AppError } from "./errors";

/** A step and what the server alone keeps: the quoted inputs and their session. */
export interface Proposal {
  view: AgentApproval;
  /** A split upscale's step: approving confirms this set. */
  setId?: string;
  input: GenerateInput;
  /** The agent's studio session, which took the quote. */
  quoteSession: string;
  /**
   * The session that held an upscale's source when it was quoted: the
   * person's (a picked take, through the read scope) or the agent's own.
   * For a deployment this is the agent session that staged its quoted tickets.
   */
  sourceSession: string;
}

/** What approval needs from the job service, through `app.ts`. */
export interface ApprovalService {
  /**
   * Hands an unspent, unexpired quote from the agent's session to the
   * person's, so the person's submission can spend it; false when it is gone,
   * spent or expired.
   */
  adopt(quoteId: string, from: string, to: string): boolean;
  /**
   * The run this session reserved under this request key, if any: a
   * read-only lookup for an approval whose outcome is uncertain.
   */
  reserved(session: string, idempotencyKey: string): string | undefined;
  /** Removes a quote so nobody can spend it, and saves that. */
  void(quoteId: string, session: string): Promise<void>;
  /**
   * Who would pay for these inputs in this session now (its run location,
   * the server's keys); throws when nobody can.
   */
  payer(input: GenerateInput, session: string): ApprovalPayer;
  /**
   * The ordinary paid write (`POST /api/jobs` with `Quote-Id`): validation,
   * route, budget, settings expectation, quote match, reservation persisted
   * before anything is sent.
   */
  submit(
    input: GenerateInput,
    session: string,
    idempotencyKey: string,
    quoteId: string,
    terms: ApprovalTerms,
  ): Promise<Job>;
  /**
   * Confirms a split upscale in the agent's session, where its cuts are:
   * each part reserved before it is sent, never resent.
   */
  confirmSet?(
    setId: string,
    session: string,
    quoteId: string,
    terms: ApprovalTerms,
  ): Promise<void>;
}

/** A measured source that may carry the split upscale it plans. */
export type SetSource = MeasuredSource & {
  set?: { id: string; parts: number };
};

/**
 * What an approval adds to the ordinary quoted submission, checked inside
 * `JobService.reserve` under the key lock: the payer the person saw, and the
 * input session, which may hold the quoted upscale's source or deployment
 * tickets (read for this one submission only). It is assigned by the server's
 * proposal, never accepted from the HTTP request.
 */
export interface ApprovalTerms {
  payer: ApprovalPayer;
  sourceSession: string;
  /** Told the run's id once it is reserved, before the provider is called. */
  onReserved?: (jobId: string) => void;
}

/**
 * Refuses, before anything is reserved, a run whose credential (chosen in the
 * same locked step) is not the payer the person approved.
 */
export function requireApprovalPayer(
  terms: ApprovalTerms,
  mode: "server" | "owner" | "byo",
  location: string | undefined,
) {
  const payer =
    location === "local" ? "local" : mode === "owner" ? "owner" : "server";
  if (mode === "byo" || payer !== terms.payer)
    throw new AppError(
      409,
      "The key that would pay changed since the quote. Ask the agent for a new quote.",
      "payer_changed",
    );
}

/** A new step for the person, newest last; a repeated quote replaces itself. */
export function propose(
  list: Proposal[],
  input: GenerateInput,
  quote: Quote,
  quoteSession: string,
  payer: ApprovalPayer,
  source?: SetSource,
  sourceSession = quoteSession,
) {
  const set = source?.set;
  const plan = approvalPlan(input, quote, source);
  if (set && plan.upscale) plan.upscale.parts = set.parts;
  const view: AgentApproval = {
    quoteId: quote.id,
    status: "pending",
    plan,
    estimateUsd: quote.estimateUsd,
    expiresAt: quote.expiresAt,
    payer,
    ...(set ? { setId: set.id } : {}),
  };
  const next = list.filter((p) => p.view.quoteId !== quote.id);
  next.push({
    view,
    input,
    quoteSession,
    sourceSession,
    ...(set ? { setId: set.id } : {}),
  });
  // Past the cap the oldest settled step goes first, then the oldest pending
  // one (never the new one). A step being submitted or whose outcome is
  // uncertain is never dropped: if only those are left, the new step is
  // refused and they stay as they are.
  while (next.length > APPROVALS_MAX) {
    const settled = next.findIndex((p) => SETTLED.has(p.view.status));
    const pending = next.findIndex(
      (p, i) => p.view.status === "pending" && i < next.length - 1,
    );
    const drop = settled >= 0 ? settled : pending;
    if (drop < 0)
      throw new AppError(
        409,
        "Too many paid steps are still being sent or checked. Wait for them to finish, then ask the agent to quote again.",
        "approvals_full",
      );
    next.splice(drop, 1);
  }
  return next;
}

/** Steps whose outcome is known and final: safe to drop past the cap. */
const SETTLED = new Set<AgentApproval["status"]>([
  "started",
  "declined",
  "expired",
  "refused",
]);

/** The views the session answers with, a pending step past its expiry marked. */
export function approvalViews(list: Proposal[], now = Date.now()) {
  for (const p of list)
    if (p.view.status === "pending" && Date.parse(p.view.expiresAt) <= now)
      p.view.status = "expired";
  return list.map((p) => ({ ...p.view, plan: { ...p.view.plan } }));
}

const closed = () =>
  new AppError(
    409,
    "This step is no longer waiting for you: it was approved, declined or expired.",
    "approval_closed",
  );

function find(list: Proposal[], quoteId: string) {
  const proposal = list.find((p) => p.view.quoteId === quoteId);
  if (!proposal)
    throw new AppError(
      404,
      "That paid step was not found.",
      "approval_missing",
    );
  return proposal;
}

/**
 * The person's Approve. Runs the quoted submission exactly once: the step
 * leaves `pending` before anything is awaited, so a second click finds it
 * closed. A definite refusal (4xx) reserved nothing and closes the step as
 * `refused`; anything else may have started a run and closes it as
 * `uncertain`, never retried.
 */
export async function approve(
  list: Proposal[],
  quoteId: string,
  owner: string,
  idempotencyKey: string,
  service: ApprovalService,
  now = Date.now(),
) {
  const proposal = find(list, quoteId);
  const { view } = proposal;
  if (view.status !== "pending") throw closed();
  if (Date.parse(view.expiresAt) <= now) {
    view.status = "expired";
    await service.void(quoteId, proposal.quoteSession);
    throw new AppError(
      409,
      "This quote expired. Ask the agent for a new one.",
      "quote_expired",
    );
  }
  const refuse = (message: string, code: string) => {
    view.status = "refused";
    view.message = message;
    return new AppError(409, message, code);
  };
  if (proposal.setId) return approveSet(proposal, quoteId, service);
  if (!service.adopt(quoteId, proposal.quoteSession, owner))
    throw refuse(
      "This quote can no longer be spent. Ask the agent for a new one.",
      "quote_used",
    );
  view.status = "submitting";
  try {
    // The payer is compared where the credential is chosen, under the lock;
    // the run's id is kept as soon as it is reserved, before it is sent.
    const job = await service.submit(
      proposal.input,
      owner,
      idempotencyKey,
      quoteId,
      {
        payer: view.payer,
        sourceSession: proposal.sourceSession,
        onReserved: (jobId) => (view.jobId = jobId),
      },
    );
    view.status = "started";
    view.jobId = job.id;
    return job;
  } catch (error) {
    if (error instanceof AppError && error.status < 500) {
      view.status = "refused";
      view.message = error.message;
    } else {
      // Possibly sent: keep the reserved run so the person can find it, by
      // the id kept above or, failing that, a read-only lookup of the key.
      // Never resubmitted.
      view.jobId ??= service.reserved(owner, idempotencyKey);
      view.status = "uncertain";
      view.message =
        "The run could not be confirmed. Check the gallery before approving anything again; it is not retried.";
    }
    throw error;
  }
}

/**
 * A split upscale's Approve: confirms the set once, in the agent's session,
 * on the payer the person saw. A definite refusal closes the step as
 * `refused`; anything else as `uncertain`, never retried.
 */
async function approveSet(
  proposal: Proposal,
  quoteId: string,
  service: ApprovalService,
): Promise<undefined> {
  const { view } = proposal;
  if (!service.confirmSet)
    throw new AppError(503, "Split upscales are not available.");
  view.status = "submitting";
  try {
    await service.confirmSet(proposal.setId!, proposal.quoteSession, quoteId, {
      payer: view.payer,
      sourceSession: proposal.sourceSession,
    });
    view.status = "started";
    return undefined;
  } catch (error) {
    view.status =
      error instanceof AppError && error.status < 500 ? "refused" : "uncertain";
    view.message =
      view.status === "refused"
        ? (error as AppError).message
        : "The parts could not be confirmed. Read the set before approving anything again; it is not retried.";
    throw error;
  }
}

/** The person's Decline: the step closes and its quote can never be spent. */
export async function decline(
  list: Proposal[],
  quoteId: string,
  service: ApprovalService,
) {
  const proposal = find(list, quoteId);
  if (proposal.view.status !== "pending") throw closed();
  proposal.view.status = "declined";
  // Awaited, so a failed save reaches the route's error handler.
  await service.void(quoteId, proposal.quoteSession);
}
