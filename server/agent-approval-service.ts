import { readsSourceClip } from "../shared/openjutsu";
// The job service's side of Confirm before spending (issue #23): which
// session holds a quote, who would pay for a run, and the ordinary quoted
// submission. Kept out of app.ts so the route stays a few lines.
import type express from "express";
import type { ApprovalPayer, MeasuredSource } from "../shared/agent-approval";
import { AGENT_RUN_HEADER } from "../shared/agent-session-events";
import type { Quote } from "../shared/quote";
import { entryFor } from "../shared/registry";
import type { GenerateInput } from "../shared/types";
import type { ApprovalService } from "./agent-approvals";
import type { AgentSessions } from "./agent-sessions";
import type { JobService } from "./jobs";
import { runCredential, type ServerKeys } from "./keys";
import type { Store } from "./store";
import type { UpscalePartsService } from "./upscale-parts";
import type { PartSetView } from "../shared/upscale-parts";
import { replayOf } from "./job-request";

export function approvalService(
  store: Store,
  keys: ServerKeys,
  service: JobService,
  /** Split upscales: an agent's set is one step (`server/upscale-parts.ts`). */
  parts?: Pick<UpscalePartsService, "confirm" | "decline">,
): ApprovalService {
  const live = (quoteId: string, session: string) =>
    store.data.quotes.find(
      (q) =>
        q.id === quoteId &&
        q.sessionId === session &&
        !q.jobId &&
        Date.parse(q.expiresAt) > Date.now(),
    );
  const payer = (input: GenerateInput, session: string): ApprovalPayer => {
    const entry = entryFor(input.generator, input.model);
    if (service.settings.plan(session, entry).location === "local")
      return "local";
    const { mode } = runCredential(
      keys,
      input.generator,
      input.model ?? "flux-3",
    );
    return mode === "owner" ? "owner" : "server";
  };
  return {
    adopt(quoteId, from, to) {
      const quote = live(quoteId, from);
      if (!quote) return false;
      quote.sessionId = to;
      return true;
    },
    async void(quoteId, session) {
      // A set's step: the set is declined and its parts' quotes voided.
      if (await parts?.decline(quoteId, session)) return;
      store.data.quotes = store.data.quotes.filter(
        (q) => !(q.id === quoteId && q.sessionId === session && !q.jobId),
      );
      await store.save();
    },
    ...(parts
      ? {
          // In the agent's session, where its cuts are, on the payer the
          // person saw; each part reserved before it is sent, as always.
          confirmSet: async (setId, session, quoteId, terms) => {
            await parts.confirm(setId, session, quoteId, undefined, terms);
          },
        }
      : {}),
    payer,
    reserved: (session, idempotencyKey) =>
      replayOf(store.data.jobs, session, idempotencyKey)?.id,
    submit: (input, session, idempotencyKey, quoteId, terms) =>
      service.submit(input, session, idempotencyKey, undefined, quoteId, terms),
  };
}

/**
 * A quote the agent's Genobi MCP server took, with its session's grant
 * (`X-Genobi-Agent-Run`), becomes a step for the person. Any other quote is
 * left alone.
 */
export async function noteAgentQuote(
  agents: AgentSessions,
  approvals: ApprovalService,
  service: Pick<JobService, "source">,
  request: express.Request,
  quoted: {
    locals: Record<string, unknown>;
    input: GenerateInput;
    quote: Quote;
    /** Where the quote read an upscale's source (`quoteFor`). */
    sourceSession: string;
  },
) {
  const { locals, input, quote, sourceSession } = quoted;
  const grant = request.headers[AGENT_RUN_HEADER.toLowerCase()];
  if (!locals.agent || typeof grant !== "string") return;
  const session = locals.sessionId as string;
  // An upscale's plan reads its source as the server recorded it, in the
  // session the quote read it from.
  let source: MeasuredSource | undefined;
  if (readsSourceClip(input) && input.sourceId)
    try {
      source = (await service.source(input.sourceId, sourceSession)).source;
    } catch {
      return;
    }
  agents.propose(
    grant,
    input,
    quote,
    session,
    () => approvals.payer(input, session),
    source,
    sourceSession,
  );
}

/**
 * A split upscale an agent's session planned, with its grant, becomes ONE
 * step for the person: the combined price of every part. Approving it
 * confirms the set; the agent cannot (`PAID_ROUTES`).
 */
export async function noteAgentSet(
  agents: AgentSessions,
  approvals: ApprovalService,
  parts: Pick<UpscalePartsService, "proposal">,
  request: express.Request,
  locals: Record<string, unknown>,
  set: PartSetView,
) {
  const grant = request.headers[AGENT_RUN_HEADER.toLowerCase()];
  if (!locals.agent || typeof grant !== "string" || set.confirmed) return;
  const session = locals.sessionId as string;
  const step = await parts.proposal(set.id, session).catch(() => undefined);
  if (!step) return;
  agents.propose(
    grant,
    step.input,
    step.quote,
    session,
    () => approvals.payer(step.input, session),
    // The set rides with the measured source (`SetSource`).
    { ...step.source, set: { id: set.id, parts: step.parts } },
  );
}
