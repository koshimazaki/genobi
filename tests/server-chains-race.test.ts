import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APPROVAL_TIMEOUT_MS } from "../shared/chain";
import { newQuote, publicQuote } from "../shared/quote";
import { startTake } from "../shared/take";
import type { GenerateInput } from "../shared/types";
import { ChainService, type ChainJobs } from "../server/chains";
import { AppError } from "../server/errors";
import type { StoredJob, Store } from "../server/store";
import { input } from "./server-harness";

// The local approval races, staged with a job service whose submissions wait
// on gates the test opens: a failed approval releases only its own claim, a
// cancel never lands under a standing claim, and a lost approval pauses again.
const SESSION = randomUUID();
const INCOMPATIBLE = "comfyui-incompatible-key";

function stagedJobs() {
  const data = {
    jobs: [] as StoredJob[],
    sources: [],
    quotes: [] as ReturnType<typeof newQuote>[],
    chains: [],
  };
  const gates = new Map<string, () => void>();
  const held = (key: string) =>
    new Promise<void>((resolve) => gates.set(key, resolve));
  const calls = { submits: [] as string[], provider: 0 };
  const jobs = {
    store: { data, save: async () => {} } as unknown as Store,
    hasServerKey: true,
    async quote(request: GenerateInput, sessionId: string) {
      const quote = {
        ...newQuote(await startTake(request, false), 1),
        sessionId,
      };
      data.quotes.push(quote);
      return publicQuote(quote);
    },
    async submit(
      request: GenerateInput,
      sessionId: string,
      idempotencyKey: string,
      byoKey?: string,
    ) {
      const key = byoKey ?? "server";
      calls.submits.push(key);
      // Each submission waits, before its reservation, until the test opens it.
      await held(key);
      if (key === INCOMPATIBLE)
        throw new AppError(400, "That key cannot run this.", "unsupported");
      const job = {
        ...request,
        id: randomUUID(),
        sessionId,
        idempotencyKey,
        status: "Pending",
      } as StoredJob;
      data.jobs.push(job);
      calls.provider++;
      return job;
    },
  } satisfies ChainJobs;
  const open = (key: string) => gates.get(key)!();
  /** Lets every pending step that is not waiting on a gate run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { chains: new ChainService(jobs), data, calls, open, settle };
}

describe("local chains: approval races", () => {
  it("never lets a failed approval release another's claim, so a cancel cannot slip in", async () => {
    const { chains, calls, open, settle } = stagedJobs();
    const { chain } = await chains.create({ stages: [{ input }] }, SESSION);
    const quoteId = chain.quote!.id;
    // The incompatible approval claims first and is held before reserving.
    const failing = chains.approve(chain.id, SESSION, quoteId, INCOMPATIBLE);
    await settle();
    // The compatible one finds that claim and sends nothing.
    const answered = await chains.approve(chain.id, SESSION, quoteId);
    expect(answered.chain.stages[0].status).toBe("submitting");
    expect(calls.submits).toEqual([INCOMPATIBLE]);
    open(INCOMPATIBLE);
    await expect(failing).rejects.toMatchObject({ code: "unsupported" });
    // Only its own claim went: the stage is paused, and a cancel is real.
    const cancelled = await chains.cancel(chain.id, SESSION);
    expect(cancelled.chain.status).toBe("cancelled");
    await expect(
      chains.approve(chain.id, SESSION, quoteId),
    ).rejects.toMatchObject({ code: "chain_cancelled" });
    expect(calls.provider).toBe(0);
  });

  it("refuses a cancel while another approval's claim is still running", async () => {
    const { chains, calls, open, settle } = stagedJobs();
    const { chain } = await chains.create({ stages: [{ input }] }, SESSION);
    const quoteId = chain.quote!.id;
    const running = chains.approve(chain.id, SESSION, quoteId);
    await settle();
    // A failing approval of the same quote cannot reach the claim.
    await chains.approve(chain.id, SESSION, quoteId, INCOMPATIBLE);
    await expect(chains.cancel(chain.id, SESSION)).rejects.toMatchObject({
      code: "chain_not_paused",
    });
    expect(calls.submits).toEqual(["server"]);
    open("server");
    expect((await running).chain.status).toBe("running");
    expect(calls.provider).toBe(1);
  });

  it("pauses a lost approval again, and never one whose run was reserved", async () => {
    const { chains, data, calls, open } = stagedJobs();
    const { chain } = await chains.create({ stages: [{ input }] }, SESSION);
    const stored = data.chains[0] as { stages: { approval?: object }[] };
    const lost = (age: number) => ({
      quoteId: chain.quote!.id,
      claimId: "lost",
      at: new Date(Date.now() - age).toISOString(),
    });
    // Within the bound the approval may still be reserving: it stands.
    stored.stages[0].approval = lost(APPROVAL_TIMEOUT_MS - 60_000);
    expect((await chains.read(chain.id, SESSION)).chain.status).toBe("running");
    // Past it the quote has expired, so the stage is paused and requoted.
    stored.stages[0].approval = lost(APPROVAL_TIMEOUT_MS + 1000);
    data.quotes[0].expiresAt = new Date(Date.now() - 1).toISOString();
    const paused = (await chains.read(chain.id, SESSION)).chain;
    expect(paused).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(paused.quote!.id).not.toBe(chain.quote!.id);
    expect(stored.stages[0].approval).toBeUndefined();
    const approving = chains.approve(chain.id, SESSION, paused.quote!.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    open("server");
    expect((await approving).chain.status).toBe("running");
    expect(calls.provider).toBe(1);
    // A reserved run is never sent again, however old its approval.
    stored.stages[0].approval = lost(10 * APPROVAL_TIMEOUT_MS);
    const read = await chains.read(chain.id, SESSION);
    expect(read.chain.stages[0].status).toBe("running");
    expect(read.chain).not.toHaveProperty("quote");
    expect(calls.submits).toEqual(["server"]);
  });
});
