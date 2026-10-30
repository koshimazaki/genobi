// Confirm before spending: an approved step's outcome outlives its place in
// the list. Approve succeeds but its answer is lost; six more quotes push the
// started step out of the visible six; recovery still finds the run through
// the session's results and hands it to the gallery. Fakes only.
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import {
  recoverApproval,
  resetRecoveriesForTests,
} from "../src/agent/approval-recovery";
import { onApprovedJob } from "../src/agent/approved-jobs";
import { agentStudio } from "./agent-harness";
import { flux } from "./agent-approvals-harness";

afterEach(() => resetRecoveriesForTests());

describe("an evicted started step", () => {
  it("still recovers its job through the session's results", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    const started = await studio.start(person, "grant hang");
    const id = started.body.id as string;
    const [, grant] = await studio.waitFor(
      person,
      id,
      /^grant ([0-9a-f]{24})$/,
    );
    // The session's Genobi MCP server: agent-marked, with its grant.
    const marks = {
      "X-Genobi-Agent-Session": "1",
      "X-Genobi-Agent-Run": grant,
    };
    const health = await fetch(`${studio.base}/api/health`, { headers: marks });
    const cookie = health.headers.get("set-cookie")!.split(";")[0];
    const quote = async (description: string) => {
      const response = await fetch(`${studio.base}/api/quotes`, {
        method: "POST",
        headers: { ...marks, cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...flux, description }),
      });
      expect(response.status).toBe(201);
      return (await response.json()).quote.id as string;
    };
    const first = await quote("The first shot.");
    // Approve; its answer is lost (the studio never sees it).
    const approved = await studio.call(
      person,
      `/sessions/${id}/approvals/${first}/approve`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } },
    );
    expect(approved.status).toBe(202);
    const jobId = approved.body.job.id as string;
    // Six more quotes: the settled step leaves the visible six.
    for (let i = 0; i < 6; i++) await quote(`Shot ${i + 2}.`);
    const { body } = await studio.call(person, `/sessions/${id}`);
    const session = body as AgentSession;
    expect(session.approvals?.some((a) => a.quoteId === first)).toBe(false);
    expect(session.results).toEqual([
      { quoteId: first, status: "started", jobId },
    ]);
    // Recovery, as the studio runs it after the lost answer.
    const jobs: string[] = [];
    const stop = onApprovedJob(({ id: job }) => jobs.push(job));
    recoverApproval(id, first, {
      read: async (sessionId) =>
        (await studio.call(person, `/sessions/${sessionId}`))
          .body as AgentSession,
      wait: () => new Promise((resolve) => setTimeout(resolve, 5)),
    });
    await expect.poll(() => jobs, { timeout: 5000 }).toEqual([jobId]);
    stop();
    expect(studio.bfl.submissions).toBe(1);
  });
});
