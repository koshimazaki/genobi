// Confirm before spending (issue #23): a quote the agent's Genobi MCP server
// takes appears in the person's session as a step with its plan and price;
// Approve runs it once, through the quoted submission, in the person's
// session; Decline and expiry run nothing; a changed setting refuses it. The
// agent is a fake runner that asks the studio for the quote over HTTP, as
// its MCP server would. Nothing is paid: the provider is a fake.
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { ServerKeys } from "../server/keys";
import { flux, quoted } from "./agent-approvals-harness";
import { input } from "./server-harness";
import { composePrompt } from "../shared/presets";

afterEach(() => vi.restoreAllMocks());

describe("an agent's quote waits for the person", () => {
  it("appears with its plan and price, and nothing is submitted", async () => {
    const { studio, session, approval } = await quoted();
    expect(session.status).toBe("waiting");
    expect(session.lines).toContain(
      `A paid step is waiting for your approval: about $${approval.estimateUsd.toFixed(2)}.`,
    );
    expect(approval).toEqual({
      quoteId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      status: "pending",
      plan: {
        entry: "flux-3-video",
        label: expect.stringContaining("FLUX 3"),
        generator: "video",
        model: "flux-3",
        // The prompt the run sends, camera sentence included.
        description: composePrompt(flux as never)
          .replace(/\s+/g, " ")
          .trim(),
        duration: 5,
        aspectRatio: "16:9",
        resolution: "hd",
        draft: false,
        route: "bfl",
      },
      estimateUsd: expect.any(Number),
      expiresAt: expect.any(String),
      payer: "server",
    });
    expect(approval.estimateUsd).toBeGreaterThan(0);
    expect(session.lines.some((l) => l.startsWith("quoted 201 "))).toBe(true);
    expect(studio.bfl.submissions).toBe(0);
  });

  it("plans an upscale from its measured source, not the request's video fields", async () => {
    const clip = path.resolve("tests/fixtures/metadata.mp4");
    const { studio, approval } = await quoted(
      {
        ...input,
        generator: "upscale",
        sourceId: "SOURCE",
        upscaleFactor: 2,
        upscaleCreativity: 1,
        upscalePrompt: " finer grain ",
        // What the request claims; the plan must not show it.
        duration: 5,
      },
      {},
      `upload ${clip}`,
    );
    expect(approval.plan).not.toHaveProperty("duration");
    expect(approval.plan).not.toHaveProperty("resolution");
    expect(approval.plan.upscale).toMatchObject({
      factor: 2,
      creativity: "Creative",
      prompt: "finer grain",
    });
    const source = studio.store.data.sources.find(
      (s) => s.id === approval.plan.upscale!.sourceId,
    )!;
    expect(approval.plan.upscale).toMatchObject({
      width: source.width,
      height: source.height,
      duration: source.duration,
    });
    expect(studio.bfl.submissions).toBe(0);
  });

  it("is not offered for a quote without the session's grant", async () => {
    const { studio, session } = await quoted(flux, {}, "no-grant");
    expect(session.approvals).toBeUndefined();
    expect(session.status).toBe("done");
    expect(studio.bfl.submissions).toBe(0);
  });

  it("Approve submits exactly once, with the quote, in the person's session", async () => {
    const { studio, person, approval, step } = await quoted();
    const approved = await step(approval.quoteId, "approve");
    expect(approved.status).toBe(202);
    const { job, session } = approved.body;
    expect(job.status).not.toBe("Error");
    expect(session.approvals[0]).toMatchObject({
      status: "started",
      jobId: job.id,
    });
    expect(studio.bfl.submissions).toBe(1);
    // The quote was spent by that run, now the person's.
    const record = studio.store.data.quotes.find(
      (q) => q.id === approval.quoteId,
    );
    expect(record).toMatchObject({ jobId: job.id });
    const history = await fetch(`${studio.base}/api/history`, {
      headers: { cookie: person },
    });
    const { jobs } = await history.json();
    expect(jobs.map((j: { id: string }) => j.id)).toContain(job.id);
    // A second click, or a Decline after, runs nothing more.
    for (const action of ["approve", "decline"]) {
      const again = await step(approval.quoteId, action);
      expect(again).toMatchObject({
        status: 409,
        body: { code: "approval_closed" },
      });
    }
    expect(studio.bfl.submissions).toBe(1);
  });

  it("Decline voids the quote and submits nothing", async () => {
    const { studio, approval, step } = await quoted();
    const declined = await step(approval.quoteId, "decline");
    expect(declined.status).toBe(200);
    expect(declined.body.approvals[0].status).toBe("declined");
    expect(
      studio.store.data.quotes.some((q) => q.id === approval.quoteId),
    ).toBe(false);
    expect((await step(approval.quoteId, "approve")).status).toBe(409);
    expect(studio.bfl.submissions).toBe(0);
  });

  it("an expired quote cannot be approved", async () => {
    const { studio, person, id, approval, step } = await quoted();
    const later = Date.parse(approval.expiresAt) + 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const read = await studio.call(person, `/sessions/${id}`);
    expect(read.body.approvals[0].status).toBe("expired");
    const refused = await step(approval.quoteId, "approve");
    expect(refused).toMatchObject({ status: 409 });
    expect(studio.bfl.submissions).toBe(0);
  });

  it("needs the session's owner, a request key and a well-formed quote id", async () => {
    const { studio, id, approval, step } = await quoted();
    const stranger = await studio.fresh();
    const other = await studio.call(
      stranger,
      `/sessions/${id}/approvals/${approval.quoteId}/approve`,
      { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } },
    );
    expect(other.status).toBe(404);
    const keyless = await step(approval.quoteId, "approve", {
      "Idempotency-Key": "",
    });
    expect(keyless.status).toBe(400);
    expect((await step("not-a-quote", "approve")).status).toBe(404);
    expect(studio.bfl.submissions).toBe(0);
  });

  it("a changed setting refuses the approval and runs nothing", async () => {
    const ran: string[] = [];
    const cloud: WorkflowClient = {
      run: async (template) => {
        ran.push(template.id);
        return `https://cloud.comfy.org/api/v2/jobs/cloud-${ran.length}`;
      },
      poll: async () => ({ id: "cloud-1", status: "Generating" }),
      download: async () => new Response(),
    };
    const acoustic = {
      ...input,
      model: "ltx-2.5-akuspace",
      duration: 6,
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    };
    const { studio, person, id, approval, step } = await quoted(acoustic, {
      app: {
        keys: new ServerKeys({
          comfy: "comfyui-test-key-0012",
          bfl: "test-server-key",
        }),
        workflows: cloud,
        runLocation: { destination: { kind: "cloud" } },
      },
    });
    expect(approval.plan).toMatchObject({
      entry: "ltx-2-5-akuspace",
      route: "workflow",
      location: "cloud",
      workflow: "ltx-2-5-akuspace-t2v",
    });
    // The person swaps the template behind that model after the quote.
    const swapped = await fetch(
      `${studio.base}/api/settings/workflows/selection`,
      {
        method: "POST",
        headers: { cookie: person, "Content-Type": "application/json" },
        body: JSON.stringify({
          entry: "ltx-2-5-akuspace",
          template: "ltx-2-5-t2v",
        }),
      },
    );
    expect(swapped.status).toBe(200);
    const refused = await step(approval.quoteId, "approve");
    expect(refused).toMatchObject({
      status: 409,
      body: { code: "quote_mismatch" },
    });
    expect(ran).toEqual([]);
    const { body } = await studio.call(person, `/sessions/${id}`);
    expect(body.approvals[0]).toMatchObject({
      status: "refused",
      message: refused.body.error,
    });
    // Closed: a second try is not a retry of the run.
    expect((await step(approval.quoteId, "approve")).body.code).toBe(
      "approval_closed",
    );
    expect(ran).toEqual([]);
  });
});
