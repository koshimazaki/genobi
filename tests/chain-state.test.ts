import { describe, expect, it } from "vitest";
import type { GenerateInput } from "../shared/types";
import { chainClient, chainController, NEEDS_KEY } from "../src/chain-client";
import {
  chainForJob,
  chainsReducer,
  chainSummary,
  emptyChains,
  type ChainAction,
  type ChainsState,
} from "../src/chain-state";
import { composerInput, initialComposer } from "../src/useComposer";
import { fakeChainServer } from "./chain-fake";

const draft: GenerateInput = {
  ...composerInput({ ...initialComposer, draft: true }),
  description: "A chrome motorbike.",
};
const upscale: GenerateInput = {
  ...draft,
  generator: "upscale",
  draft: false,
  upscaleFactor: 1.5,
};

/** The hook's state and controller, without React: the same reducer and calls. */
function studio({ key = "bfl-test-key", canSend = true, now = Date.now } = {}) {
  const server = fakeChainServer();
  let state: ChainsState = emptyChains;
  /** Stages shown, once each: the first hand-off of a started stage. */
  const started: string[] = [];
  /** Every registration attempt, and the answers the next ones give. */
  const registrations: string[] = [];
  const failRegistrations = { count: 0 };
  /** Recovery reads the controller asked for, run by hand with their delay. */
  const later: { run: () => void; ms: number }[] = [];
  const controller = chainController({
    client: chainClient(server.fetch, () => key),
    dispatch: (action: ChainAction) => {
      state = chainsReducer(state, action);
    },
    canSend: () => canSend,
    onStageStarted: async (jobId, first) => {
      if (first) started.push(jobId);
      registrations.push(jobId);
      if (failRegistrations.count === 0) return true;
      failRegistrations.count--;
      return false;
    },
    now,
    schedule: (run, ms) => {
      later.push({ run, ms });
      return () => {};
    },
  });
  const entry = (id: string) => state.entries[id];
  /** Runs the next waiting recovery read and waits for it to settle. */
  const runLater = async () => {
    later.shift()!.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    server,
    controller,
    entry,
    started,
    registrations,
    failRegistrations,
    later,
    runLater,
    state: () => state,
  };
}

describe("chains in the studio: create, pause, approve", () => {
  it("pauses before each stage and approves each with its own quote", async () => {
    const { server, controller, entry, started, state } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }, { input: upscale }] },
      { origin: "fast" },
    );
    expect(state().focusId).toBe(chain.id);
    const first = entry(chain.id);
    expect(first.chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(first.chain.quote?.recipe.id).toBe("flux-3-video");
    expect(chainSummary(first)).toBe(
      "Stage 1 of 2 · Draft · waiting for approval",
    );
    // Creating spends nothing: no approval has been sent.
    expect(server.posts("/approve")).toBe(0);

    await controller.approve(first);
    const sentApproval = server.sent.at(-1)!;
    expect(sentApproval.headers["Quote-Id"]).toBe(first.chain.quote!.id);
    expect(sentApproval.headers["x-byo-key"]).toBe("bfl-test-key");
    expect(entry(chain.id).chain.status).toBe("running");
    expect(started).toEqual([entry(chain.id).chain.stages[0].jobId]);
    expect(chainForJob(state(), started[0])?.chain.id).toBe(chain.id);

    await controller.read(chain.id);
    const second = entry(chain.id);
    expect(second.chain).toMatchObject({ status: "paused", pausedAt: 1 });
    expect(second.chain.quote!.id).not.toBe(first.chain.quote!.id);
    expect(second.chain.quote!.recipe.id).toBe("flux-video-upscale");
    expect(chainSummary(second)).toBe(
      "Stage 2 of 2 · Upscale 1.5× · waiting for approval",
    );

    await controller.approve(second);
    await controller.read(chain.id);
    expect(entry(chain.id).chain.status).toBe("complete");
    expect(chainSummary(entry(chain.id))).toBe("All 2 stages ready");
    expect(server.posts("/approve")).toBe(2);
    expect(started).toHaveLength(2);
  });

  it("cancels at a pause and has nothing left to approve", async () => {
    const { server, controller, entry } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }, { input: upscale }] },
      { origin: "fast" },
    );
    await controller.cancel(entry(chain.id));
    expect(entry(chain.id).chain.status).toBe("cancelled");
    expect(entry(chain.id).chain.stages.map((s) => s.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal?.code).toBe("quote_missing");
    expect(server.posts("/approve")).toBe(0);
  });

  it("shows a refused approval and never sends it again", async () => {
    const { server, controller, entry } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    server.refuseNext(
      409,
      "This quote is not the one the chain is waiting on.",
      "quote_mismatch",
    );
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal).toEqual({
      message: "This quote is not the one the chain is waiting on.",
      code: "quote_mismatch",
    });
    // One approval sent; the follow-up is a free read, not a second approval.
    expect(server.posts("/approve")).toBe(1);
    expect(server.sent.at(-1)!.method).toBe("GET");
    expect(entry(chain.id).chain.status).toBe("paused");

    server.refuseNext(409, "This chain is not waiting.", "chain_not_paused");
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal?.code).toBe("chain_not_paused");
    expect(server.posts("/approve")).toBe(2);
  });

  it("hands a stage a lost approval started to the job poller, without approving again", async () => {
    const { server, controller, entry, started } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }, { input: upscale }] },
      { origin: "fast" },
    );
    server.loseNextApproval();
    await controller.approve(entry(chain.id));
    // One approval sent; the recovery is a read, and it finds the stage's job.
    expect(server.posts("/approve")).toBe(1);
    expect(server.sent.at(-1)!.method).toBe("GET");
    const jobId = server.chains.get(chain.id)!.stages[0].jobId!;
    expect(jobId).toBeTruthy();
    expect(started).toEqual([jobId]);
    // The chain moved on, so the lost answer's message is retired.
    expect(entry(chain.id).chain.stages[0].jobId).toBe(jobId);
    expect(entry(chain.id).refusal).toBeUndefined();
  });

  it("keeps reading, never approving, when the approval and its read are both lost", async () => {
    const { server, controller, entry, started, later, runLater } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }, { input: upscale }] },
      { origin: "fast" },
    );
    const paused = entry(chain.id);
    server.loseNextApproval();
    server.loseReads(2);
    await controller.approve(paused);
    // Nothing answered: the chain is uncertain, and a read is waiting.
    expect(entry(chain.id).uncertain).toBe(true);
    expect(later.map((item) => item.ms)).toEqual([2_000]);
    expect(started).toEqual([]);
    // The person cannot send the approval again, or a cancel, meanwhile.
    await controller.approve(paused);
    await controller.cancel(entry(chain.id));
    expect(entry(chain.id).refusal?.code).toBe("approval_uncertain");

    await runLater();
    expect(later.map((item) => item.ms)).toEqual([4_000]);
    await runLater();
    // The third read answers: the stage the lost approval started is polled.
    expect(later).toEqual([]);
    expect(entry(chain.id).uncertain).toBeUndefined();
    const jobId = server.chains.get(chain.id)!.stages[0].jobId!;
    expect(started).toEqual([jobId]);
    expect(server.posts("/approve")).toBe(1);
    expect(server.posts("/cancel")).toBe(0);
    expect(server.sent.filter((r) => r.method === "GET").length).toBe(3);
  });

  it("collects a stage that was still submitting when its answer was read", async () => {
    const { server, controller, entry, started, later } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    server.submitSlowly();
    server.loseNextApproval();
    await controller.approve(entry(chain.id));
    // The recovery read answered: the stage is claimed, with no job yet.
    expect(entry(chain.id).chain.stages[0].status).toBe("submitting");
    expect(entry(chain.id).chain.stages[0].jobId).toBeUndefined();
    expect(later).toEqual([]);
    expect(started).toEqual([]);
    // The running chain's ordinary read finds the job and hands it over, once.
    await controller.read(chain.id);
    const jobId = server.chains.get(chain.id)!.stages[0].jobId!;
    expect(started).toEqual([jobId]);
    await controller.read(chain.id);
    expect(started).toEqual([jobId]);
    expect(server.posts("/approve")).toBe(1);
  });

  it("collects a stage a confirmed approval left submitting", async () => {
    const { server, controller, entry, started } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    server.submitSlowly();
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).chain.status).toBe("running");
    expect(started).toEqual([]);
    // Still claimed on the first read; the job shows on the next.
    await controller.read(chain.id);
    expect(started).toEqual([]);
    await controller.read(chain.id);
    expect(started).toEqual([server.chains.get(chain.id)!.stages[0].jobId]);
    expect(started[0]).toBeTruthy();
  });

  it("keeps a started stage's hand-off until the poller has it", async () => {
    const t = studio();
    const chain = await t.controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    // Registration fails twice, as when the history request after Approve
    // fails: the hand-off is kept and tried again later, never dropped.
    t.failRegistrations.count = 2;
    await t.controller.approve(t.entry(chain.id));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const jobId = t.server.chains.get(chain.id)!.stages[0].jobId!;
    expect(t.started).toEqual([jobId]);
    expect(t.registrations).toEqual([jobId]);
    expect(t.later.map((item) => item.ms)).toEqual([2_000]);
    // An ordinary read meanwhile does not start a second hand-off.
    await t.controller.read(chain.id);
    expect(t.registrations).toHaveLength(1);
    await t.runLater();
    expect(t.later.map((item) => item.ms)).toEqual([4_000]);
    await t.runLater();
    // Registered on the third try: shown once, nothing more scheduled.
    expect(t.registrations).toEqual([jobId, jobId, jobId]);
    expect(t.started).toEqual([jobId]);
    expect(t.later).toEqual([]);
    expect(t.server.posts("/approve")).toBe(1);
  });

  it("registers a stage job reserved after a reload, without showing it", async () => {
    const before = studio();
    const chain = await before.controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    // Approved and claimed; the page reloads before the job is reserved.
    before.server.submitSlowly();
    await before.controller.approve(before.entry(chain.id));
    expect(before.started).toEqual([]);
    before.controller.dispose();

    // The reloaded page: a new controller with no record of that approval.
    let state: ChainsState = emptyChains;
    const calls: [string, boolean][] = [];
    const after = chainController({
      client: chainClient(before.server.fetch, () => "bfl-test-key"),
      dispatch: (action) => {
        state = chainsReducer(state, action);
      },
      canSend: () => true,
      onStageStarted: (jobId, show) => {
        calls.push([jobId, show]);
        return true;
      },
    });
    // Loading reads the running chain; the stage is still claimed.
    await after.load();
    expect(state.entries[chain.id].chain.stages[0].status).toBe("submitting");
    expect(calls).toEqual([]);
    // The four-second read finds the reserved job: registered, not shown.
    await after.read(chain.id);
    const jobId = before.server.chains.get(chain.id)!.stages[0].jobId!;
    expect(calls).toEqual([[jobId, false]]);
    // Read again, or listed again: the same job is never handed over twice.
    await after.read(chain.id);
    await after.load();
    expect(calls).toEqual([[jobId, false]]);
    expect(before.server.posts("/approve")).toBe(1);
  });

  it("keeps reading while a lost approval's claim has not landed yet", async () => {
    const t = studio();
    const chain = await t.controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    // The answer is lost, and the claim lands only after the first read.
    t.server.approveLate(1);
    await t.controller.approve(t.entry(chain.id));
    // That read still shows the pause: the outcome is unknown, not refused.
    expect(t.entry(chain.id).chain.status).toBe("paused");
    expect(t.entry(chain.id).uncertain).toBe(true);
    expect(t.later.map((item) => item.ms)).toEqual([2_000]);
    await t.controller.approve(t.entry(chain.id));
    expect(t.entry(chain.id).refusal?.code).toBe("approval_uncertain");
    await t.runLater();
    // The next read finds the stage the approval started: shown and polled.
    const jobId = t.server.chains.get(chain.id)!.stages[0].jobId!;
    expect(jobId).toBeTruthy();
    expect(t.started).toEqual([jobId]);
    expect(t.entry(chain.id).uncertain).toBeUndefined();
    expect(t.later).toEqual([]);
    expect(t.server.posts("/approve")).toBe(1);
  });

  it("stops recovering once the lost approval can no longer reserve work", async () => {
    let clock = Date.now();
    const t = studio({ now: () => clock });
    const chain = await t.controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    const { expiresAt } = t.entry(chain.id).chain.quote!;
    t.server.approveLate(Infinity);
    await t.controller.approve(t.entry(chain.id));
    expect(t.entry(chain.id).uncertain).toBe(true);
    // Past the quote's expiry and the clock margin, the pause is final.
    clock = Date.parse(expiresAt) + 61_000;
    await t.runLater();
    expect(t.entry(chain.id).uncertain).toBeUndefined();
    expect(t.entry(chain.id).chain.status).toBe("paused");
    expect(t.later).toEqual([]);
    expect(t.started).toEqual([]);
    expect(t.server.posts("/approve")).toBe(1);
  });

  it("reads once after a refusal the server answered", async () => {
    const t = studio();
    const chain = await t.controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    t.server.refuseNext(409, "Not this quote.", "quote_mismatch");
    await t.controller.approve(t.entry(chain.id));
    expect(t.entry(chain.id).uncertain).toBeUndefined();
    expect(t.later).toEqual([]);
    expect(t.server.sent.filter((r) => r.method === "GET")).toHaveLength(1);
  });

  it("asks for a key, or a fresh quote, before sending anything", async () => {
    const keyless = studio({ key: "", canSend: false });
    await expect(
      keyless.controller.start(
        { stages: [{ input: draft }] },
        { origin: "fast" },
      ),
    ).rejects.toMatchObject({ code: NEEDS_KEY });
    expect(keyless.server.sent).toHaveLength(0);

    const { server, controller, entry } = studio();
    const chain = await controller.start(
      { stages: [{ input: draft }] },
      { origin: "fast" },
    );
    const refused: ChainAction[] = [];
    const late = chainController({
      client: chainClient(server.fetch, () => "bfl-test-key"),
      dispatch: (action) => refused.push(action),
      canSend: () => true,
      now: () => Date.now() + 11 * 60_000,
    });
    await late.approve(entry(chain.id));
    expect(refused).toEqual([
      expect.objectContaining({ type: "refused", code: "quote_expired" }),
    ]);
    expect(server.posts("/approve")).toBe(0);

    const withoutKey = chainController({
      client: chainClient(server.fetch, () => ""),
      dispatch: (action) => refused.push(action),
      canSend: () => false,
    });
    await withoutKey.approve(entry(chain.id));
    expect(refused.at(-1)).toMatchObject({ code: NEEDS_KEY });
    expect(server.posts("/approve")).toBe(0);
  });
});
