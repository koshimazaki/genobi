// The approval tests' start: a fake runner that quotes as the agent's Genobi
// MCP server would, and the person's Approve and Decline for its step.
import { expect } from "vitest";
import type { AgentApproval } from "../shared/agent-approval";
import { agentStudio } from "./agent-harness";
import { input } from "./server-harness";

export const flux = { ...input, model: "flux-3" };

export async function quoted(
  body: object = flux,
  options: Parameters<typeof agentStudio>[0] = {},
  extra = "",
  /** Polls of 50 ms before the session must have settled. */
  settleTries?: number,
) {
  const studio = await agentStudio(options);
  const person = await studio.fresh();
  const started = await studio.start(
    person,
    `quote ${JSON.stringify(body)} ${extra}`,
  );
  expect(started.status).toBe(201);
  const id = started.body.id as string;
  const session = await studio.settle(person, id, settleTries);
  const approval = session.approvals?.[0] as AgentApproval;
  const step = (quoteId: string, action: string, headers: object = {}) =>
    studio.call(person, `/sessions/${id}/approvals/${quoteId}/${action}`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID(), ...headers },
    });
  return { studio, person, id, session, approval, step };
}
