// The approval steps on their own (server/agent-approvals.ts): each closes
// before anything is awaited, a refusal is final, an uncertain run is never
// retried, and an expired quote or a changed payer submits nothing.
import { describe, expect, it, vi } from "vitest";
import {
  approvalViews,
  approve,
  decline,
  propose,
  requireApprovalPayer,
  type ApprovalService,
  type Proposal,
} from "../server/agent-approvals";
import { AppError } from "../server/errors";
import { APPROVALS_MAX } from "../shared/agent-approval";
import type { Quote } from "../shared/quote";
import type { GenerateInput, Job } from "../shared/types";
import { input as base } from "./server-harness";

const input = { ...base, model: "flux-3" } as unknown as GenerateInput;
const quote = (id: string, ms = 600_000): Quote => ({
  id,
  estimateUsd: 0.85,
  recipe: { id: "flux-3-video", version: 1, route: "bfl" },
  expiresAt: new Date(Date.now() + ms).toISOString(),
});

function service(submit: ApprovalService["submit"]) {
  return {
    adopt: vi.fn(() => true),
    void: vi.fn(async () => {}),
    payer: vi.fn(() => "server" as const),
    reserved: vi.fn((): string | undefined => undefined),
    submit: vi.fn(submit),
  };
}
const one = (q = quote("q1")) => propose([], input, q, "agent", "server");

describe("approval steps", () => {
  it("submits once and closes; a second approval finds it closed", async () => {
    const list = one();
    const s = service(async () => ({ id: "job-1" }) as Job);
    await approve(list, "q1", "person", "key-00000001", s);
    expect(s.adopt).toHaveBeenCalledWith("q1", "agent", "person");
    expect(s.submit).toHaveBeenCalledTimes(1);
    // The payer and the source's session go into the locked reservation.
    expect(s.submit).toHaveBeenCalledWith(
      input,
      "person",
      "key-00000001",
      "q1",
      expect.objectContaining({ payer: "server", sourceSession: "agent" }),
    );
    expect(approvalViews(list)[0]).toMatchObject({
      status: "started",
      jobId: "job-1",
    });
    await expect(
      approve(list, "q1", "person", "key-00000002", s),
    ).rejects.toMatchObject({ code: "approval_closed" });
    expect(s.submit).toHaveBeenCalledTimes(1);
  });

  it("marks an unconfirmed run uncertain and never retries it", async () => {
    const list = one();
    const s = service(async () => {
      throw new Error("connection reset");
    });
    await expect(
      approve(list, "q1", "person", "key-00000001", s),
    ).rejects.toThrow("connection reset");
    expect(approvalViews(list)[0].status).toBe("uncertain");
    await expect(
      approve(list, "q1", "person", "key-00000001", s),
    ).rejects.toMatchObject({ code: "approval_closed" });
    expect(s.submit).toHaveBeenCalledTimes(1);
  });

  it("closes as refused on a definite refusal, with the studio's words", async () => {
    const list = one();
    const s = service(async () => {
      throw new AppError(409, "The run location changed.", "settings_changed");
    });
    await expect(
      approve(list, "q1", "person", "key-00000001", s),
    ).rejects.toMatchObject({ code: "settings_changed" });
    expect(approvalViews(list)[0]).toMatchObject({
      status: "refused",
      message: "The run location changed.",
    });
  });

  it("an expired quote is voided and nothing is adopted or sent", async () => {
    const list = one(quote("q1", 1000));
    const s = service(async () => ({ id: "job-1" }) as Job);
    await expect(
      approve(list, "q1", "person", "key-00000001", s, Date.now() + 5000),
    ).rejects.toMatchObject({ code: "quote_expired" });
    expect(s.void).toHaveBeenCalledWith("q1", "agent");
    expect(s.adopt).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("a payer refused under the lock closes the step; a spent quote sends nothing", async () => {
    const list = one();
    const s = service(async () => {
      throw new AppError(409, "The key changed.", "payer_changed");
    });
    await expect(
      approve(list, "q1", "person", "key-00000001", s),
    ).rejects.toMatchObject({ code: "payer_changed" });
    expect(approvalViews(list)[0].status).toBe("refused");
    s.submit.mockClear();
    const other = one();
    s.adopt.mockReturnValueOnce(false);
    await expect(
      approve(other, "q1", "person", "key-00000001", s),
    ).rejects.toMatchObject({ code: "quote_used" });
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("Decline voids the quote once; the list keeps the newest steps", async () => {
    const list = one();
    const s = service(async () => ({ id: "job-1" }) as Job);
    await decline(list, "q1", s);
    expect(s.void).toHaveBeenCalledWith("q1", "agent");
    await expect(decline(list, "q1", s)).rejects.toThrow(/no longer waiting/);
    let many: Proposal[] = [];
    for (let i = 0; i < APPROVALS_MAX + 3; i++)
      many = propose(many, input, quote(`q${i}`), "agent", "server");
    expect(many).toHaveLength(APPROVALS_MAX);
    expect(many.at(-1)?.view.quoteId).toBe(`q${APPROVALS_MAX + 2}`);
  });

  it("a failed save while voiding reaches the caller, from Decline and expiry", async () => {
    const s = service(async () => ({ id: "job-1" }) as Job);
    s.void.mockRejectedValue(new Error("disk full"));
    await expect(decline(one(), "q1", s)).rejects.toThrow("disk full");
    await expect(
      approve(
        one(quote("q1", 1000)),
        "q1",
        "p",
        "key-00000001",
        s,
        Date.now() + 5000,
      ),
    ).rejects.toThrow("disk full");
  });

  it("refuses a credential other than the approved payer", () => {
    const terms = { payer: "owner" as const, sourceSession: "agent" };
    expect(() => requireApprovalPayer(terms, "owner", undefined)).not.toThrow();
    for (const [mode, location] of [
      ["server", undefined],
      ["byo", undefined],
      ["owner", "local"],
    ] as const)
      expect(() => requireApprovalPayer(terms, mode, location)).toThrow(
        expect.objectContaining({ code: "payer_changed" }),
      );
  });

  it("never drops a step being submitted: a seventh quote evicts a pending one, or is refused", () => {
    let list: Proposal[] = [];
    for (let i = 0; i < APPROVALS_MAX; i++)
      list = propose(list, input, quote(`q${i}`), "agent", "server");
    list[0].view.status = "submitting";
    list = propose(list, input, quote("q-new"), "agent", "server");
    expect(list.map((p) => p.view.quoteId)).toEqual([
      "q0",
      "q2",
      "q3",
      "q4",
      "q5",
      "q-new",
    ]);
    expect(list[0].view.status).toBe("submitting");
    // Its outcome still lands on it, so recovery finds its job id.
    Object.assign(list[0].view, { status: "started", jobId: "job-0" });
    expect(approvalViews(list)[0]).toMatchObject({ jobId: "job-0" });
    // With every step in flight or uncertain, a new one is refused.
    for (const p of list)
      p.view.status = p === list[0] ? "submitting" : "uncertain";
    expect(() =>
      propose(list, input, quote("q-more"), "agent", "server"),
    ).toThrow(expect.objectContaining({ code: "approvals_full" }));
    expect(list).toHaveLength(APPROVALS_MAX);
  });

  it("keeps the reserved run's id when the outcome is uncertain, without resubmitting", async () => {
    const list = one();
    const s = service(async (_i, _s, _k, _q, terms) => {
      terms.onReserved?.("job-reserved");
      throw new Error("the save after the provider failed");
    });
    await expect(
      approve(list, "q1", "person", "key-00000001", s),
    ).rejects.toThrow();
    expect(approvalViews(list)[0]).toMatchObject({
      status: "uncertain",
      jobId: "job-reserved",
    });
    // No id reported: found read-only by the request key.
    const other = one();
    const t = service(async () => {
      throw new Error("lost");
    });
    t.reserved.mockReturnValue("job-by-key");
    await expect(
      approve(other, "q1", "person", "key-00000002", t),
    ).rejects.toThrow();
    expect(t.reserved).toHaveBeenCalledWith("person", "key-00000002");
    expect(approvalViews(other)[0].jobId).toBe("job-by-key");
    expect(s.submit).toHaveBeenCalledTimes(1);
    expect(t.submit).toHaveBeenCalledTimes(1);
  });
});
