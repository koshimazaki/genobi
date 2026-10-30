/**
 * The local server's project-prompt routes (issue #23). Every request carries
 * the studio's header, which the server requires so that no other site can
 * start an agent. The hosted studio relays to a paired local runner; a missing
 * or malformed status reads as unavailable.
 */
import type {
  AgentMessageRequest,
  AgentRunnerStatus,
  AgentSession,
  AgentSessionRequest,
} from "../../shared/agent-session";
import {
  AGENT_REQUEST_HEADER,
  AGENT_SESSION_ID,
} from "../../shared/agent-session-events";
import type { ApprovalPlan } from "../../shared/agent-approval";
import type { Job } from "../../shared/types";
import {
  expectedHeaders,
  settingsHold,
  type SettingsHold,
} from "../settings-store";
import { studioContext } from "./studio-context";

const HEADERS = { [AGENT_REQUEST_HEADER]: "1" };
const HOSTED =
  "No configured or paired runner is available. Check runner setup in Settings.";

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/agent${path}`, {
    ...init,
    headers: { ...HEADERS, ...init.headers },
  });
  const body = await response.json().catch(() => undefined);
  init.signal?.throwIfAborted();
  if (!response.ok)
    throw new AgentRefusal(
      typeof body?.error === "string"
        ? body.error
        : "The agent session could not be reached.",
      typeof body?.code === "string" ? body.code : undefined,
      typeof body?.sessionId === "string" &&
        AGENT_SESSION_ID.test(body.sessionId)
        ? body.sessionId
        : undefined,
    );
  return body as T;
}

/**
 * The server's refusal: its sentence, its code, and for `agent_busy` the
 * owner's running session, which the studio shows instead of a dead end.
 */
export class AgentRefusal extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly sessionId?: string,
  ) {
    super(message);
  }
}

export async function agentStatus(
  signal?: AbortSignal,
): Promise<AgentRunnerStatus> {
  try {
    const body = await send<AgentRunnerStatus>("/status", { signal });
    if (typeof body?.available !== "boolean")
      return { available: false, message: HOSTED };
    return body;
  } catch (error) {
    if (signal?.aborted)
      throw new Error(
        "Checking your agent timed out. Check the studio connection and try again.",
        { cause: error },
      );
    if ((error as Error).name === "AbortError") throw error;
    return { available: false, message: HOSTED };
  }
}

/**
 * Starts the agent; throws an Error whose message is safe to show. Every
 * start carries the studio's context (recent picks and composer settings)
 * unless the caller sent its own.
 */
export async function startAgentSession(
  request: AgentSessionRequest,
  startId: string = crypto.randomUUID(),
) {
  const context = request.context ?? studioContext();
  return send<AgentSession>("/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": startId,
    },
    body: JSON.stringify({ ...request, ...(context ? { context } : {}) }),
  });
}

export function readAgentSession(id: string, signal?: AbortSignal) {
  return send<AgentSession>(`/sessions/${encodeURIComponent(id)}`, { signal });
}

/**
 * The owner's running session, if any (`GET /api/agent/sessions`): after a
 * reload the page may not know it yet. Undefined when none or unreachable.
 */
export async function readActiveSession(): Promise<AgentSession | undefined> {
  try {
    const body = await send<{ session?: AgentSession | null }>("/sessions");
    return body?.session && AGENT_SESSION_ID.test(body.session.id)
      ? body.session
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A further message for the running session (Box 1.8). Refused with
 * `agent_no_live_transport` when its runner takes no further input.
 */
export function sendAgentMessage(id: string, request: AgentMessageRequest) {
  return send<AgentSession>(`/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function stopAgentSession(id: string) {
  return send<AgentSession>(`/sessions/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
}

const step = (id: string, quoteId: string, action: "approve" | "decline") =>
  `/sessions/${encodeURIComponent(id)}/approvals/${encodeURIComponent(quoteId)}/${action}`;

/**
 * Why Approve waits, in the words chain approval uses (#61): a run location
 * or template still being saved, restored or checked is not what the
 * request's expected-settings headers would say.
 */
export function approvalHold(hold: SettingsHold) {
  return hold === "restoring"
    ? "This run's settings are still being restored. Approve once they are set."
    : hold === "checking"
      ? "The studio is checking the run location or workflow. Approve once it is confirmed."
      : hold === "saving"
        ? "The run location or workflow is still being saved. Approve once it is confirmed."
        : undefined;
}

/** Approve refused before anything was sent: nothing reached the server. */
export class ApprovalHeld extends Error {}

/**
 * The person's Approve for a quoted step: one request, never repeated here.
 * A new idempotency key per click, and the run location and template this
 * studio shows, so the server refuses a run whose settings changed
 * (`settings_changed`). Throws an Error whose message is safe to show.
 */
export async function approveStep(
  id: string,
  quoteId: string,
  plan: ApprovalPlan,
) {
  // The settings hold, as Generate and chain approval honour it.
  const held = approvalHold(settingsHold());
  if (held) throw new ApprovalHeld(held);
  return send<{ session: AgentSession; job?: Job }>(
    step(id, quoteId, "approve"),
    {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        ...expectedHeaders({
          generator: plan.generator,
          model: plan.model as Job["model"],
        }),
      },
    },
  );
}

/** The person's Decline: the quote is voided and nothing runs. */
export function declineStep(id: string, quoteId: string) {
  return send<AgentSession>(step(id, quoteId, "decline"), { method: "POST" });
}
