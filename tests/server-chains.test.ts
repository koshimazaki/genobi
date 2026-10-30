import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ChainView } from "../shared/chain";
import { input, setup } from "./server-harness";

// Chained jobs on the local adapter: a chain pauses before every paid stage,
// an approval spends that pause's quote exactly once, and only the owner can
// read, approve or cancel it.
const upscale = { ...input, generator: "upscale", cameraEnabled: false };
type Reply = {
  chain: ChainView;
  chains?: ChainView[];
  needsKey?: true;
  pauseError?: { code: string };
  code?: string;
};

async function studio() {
  const harness = await setup();
  const { base, cookie, bfl } = harness;
  bfl.media = new Uint8Array(
    await readFile(path.resolve("tests/fixtures/metadata.mp4")),
  );
  const send = async (
    route: string,
    init: { method?: string; body?: object; headers?: object } = {},
  ) => {
    const response = await fetch(`${base}/api/chains${route}`, {
      method: init.method ?? "GET",
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string>),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    return { status: response.status, ...((await response.json()) as Reply) };
  };
  const create = (body: object = { stages: [{ input }, { input: upscale }] }) =>
    send("", { method: "POST", body });
  const approve = (id: string, quoteId?: string, headers: object = {}) =>
    send(`/${id}/approve`, {
      method: "POST",
      headers: { ...(quoteId ? { "Quote-Id": quoteId } : {}), ...headers },
    });
  const finish = (jobId: string) =>
    fetch(`${base}/api/jobs/${jobId}`, { headers: { cookie } });
  return { ...harness, send, create, approve, finish };
}

describe("local chains: approval between paid stages", () => {
  it("pauses before each stage and submits exactly once per approval", async () => {
    const { create, approve, send, finish, bfl, store } = await studio();
    const created = await create();
    expect(created.status).toBe(201);
    const { chain } = created;
    expect(chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(chain.stages.map((stage) => stage.status)).toEqual([
      "paused",
      "waiting",
    ]);
    expect(chain.quote?.recipe.id).toBe("flux-3-video");
    // Creating quotes stage 1 only and sends nothing.
    expect(store.data.quotes).toHaveLength(1);
    expect(bfl.submissions).toBe(0);

    // A quote the chain is not waiting on runs nothing. (Eight POSTs a
    // minute per session: this case spends exactly that.)
    const stranger = await approve(chain.id, randomUUID());
    expect(stranger).toMatchObject({ status: 409, code: "quote_mismatch" });
    expect(bfl.submissions).toBe(0);

    const first = await approve(chain.id, chain.quote!.id);
    expect(first.status).toBe(202);
    expect(first.chain.status).toBe("running");
    const jobId = first.chain.stages[0].jobId!;
    expect(bfl.submissions).toBe(1);
    // The same approval again is the same run, not a second one.
    const again = await approve(chain.id, chain.quote!.id);
    expect(again.chain.stages[0].jobId).toBe(jobId);
    expect(bfl.submissions).toBe(1);
    // Running: no pause, no quote, nothing to approve.
    const running = await send(`/${chain.id}`);
    expect(running.chain).not.toHaveProperty("quote");
    expect(running.chain.stages[0].status).toBe("running");

    bfl.ready = true;
    expect((await (await finish(jobId)).json()).job.status).toBe("Ready");
    const paused = (await send(`/${chain.id}`)).chain;
    expect(paused).toMatchObject({ status: "paused", pausedAt: 1 });
    expect(paused.stages.map((stage) => stage.status)).toEqual([
      "ready",
      "paused",
    ]);
    // A fresh quote for the upscale, priced from the measured take.
    expect(paused.quote!.id).not.toBe(chain.quote!.id);
    expect(paused.quote!.recipe.id).toBe("flux-video-upscale");
    // Reading again keeps the live quote rather than minting another.
    expect((await send(`/${chain.id}`)).chain.quote!.id).toBe(paused.quote!.id);
    // The spent stage 1 quote cannot approve stage 2.
    const reused = await approve(chain.id, chain.quote!.id);
    expect(reused).toMatchObject({ status: 409, code: "quote_mismatch" });
    expect(bfl.submissions).toBe(1);

    // Two approvals at once still make one run: the second finds the
    // first's claim and answers without submitting.
    const [one, two] = await Promise.all([
      approve(chain.id, paused.quote!.id),
      approve(chain.id, paused.quote!.id),
    ]);
    expect([one.status, two.status]).toEqual([202, 202]);
    expect(bfl.submissions).toBe(2);
    expect(bfl.requests[1].generator).toBe("upscale");
    const upscaledId = (await send(`/${chain.id}`)).chain.stages[1].jobId;
    const upscaled = store.data.jobs.find((job) => job.id === upscaledId)!;
    // The upscale reads stage 1's take by its asset id.
    expect(upscaled.sourceId).toBe(jobId);
    expect(upscaled.idempotencyKey).toBe(`chain-${chain.id}-1`);

    expect((await (await finish(upscaled.id)).json()).job.status).toBe("Ready");
    const done = (await send(`/${chain.id}`)).chain;
    expect(done.status).toBe("complete");
    expect(done).not.toHaveProperty("quote");
    expect((await approve(chain.id, randomUUID())).code).toBe(
      "chain_not_paused",
    );
    expect(bfl.submissions).toBe(2);
  });

  it("pauses again when a quote expires before approval", async () => {
    const { create, approve, send, bfl, store } = await studio();
    const { chain } = await create({ stages: [{ input }] });
    // No quote, or a malformed one: refused before the chain is touched.
    expect((await approve(chain.id)).status).toBe(400);
    expect((await approve(chain.id, "not-a-quote")).status).toBe(400);
    store.data.quotes[0].expiresAt = new Date(Date.now() - 1).toISOString();
    const late = await approve(chain.id, chain.quote!.id);
    expect(late).toMatchObject({ status: 410, code: "quote_expired" });
    expect(bfl.submissions).toBe(0);
    const reread = (await send(`/${chain.id}`)).chain;
    expect(reread.stages[0].status).toBe("paused");
    expect(reread.quote!.id).not.toBe(chain.quote!.id);
    expect((await approve(chain.id, reread.quote!.id)).status).toBe(202);
    expect(bfl.submissions).toBe(1);
  });

  it("fails the chain on an uncertain submission and never retries it", async () => {
    const { create, approve, send, bfl } = await studio();
    bfl.failSubmit = true;
    const { chain } = await create();
    const failed = await approve(chain.id, chain.quote!.id);
    expect(failed.chain.status).toBe("failed");
    expect(failed.chain.stages[0].status).toBe("failed");
    expect(bfl.submissions).toBe(1);
    bfl.failSubmit = false;
    // Approving again answers with the failed run; nothing is sent.
    expect((await approve(chain.id, chain.quote!.id)).chain.status).toBe(
      "failed",
    );
    const read = await send(`/${chain.id}`);
    expect(read.chain).not.toHaveProperty("quote");
    expect(bfl.submissions).toBe(1);
  });

  it("cancels at a pause, and only there", async () => {
    const { create, approve, send, bfl } = await studio();
    const { chain } = await create();
    const cancelled = await send(`/${chain.id}/cancel`, { method: "POST" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.chain.status).toBe("cancelled");
    expect(cancelled.chain.stages.map((stage) => stage.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect((await approve(chain.id, chain.quote!.id)).code).toBe(
      "chain_cancelled",
    );
    // Cancelling twice is the same cancel.
    expect(
      (await send(`/${chain.id}/cancel`, { method: "POST" })).chain.status,
    ).toBe("cancelled");
    const other = (await create()).chain;
    await approve(other.id, other.quote!.id);
    const busy = await send(`/${other.id}/cancel`, { method: "POST" });
    expect(busy).toMatchObject({ status: 409, code: "chain_not_paused" });
    expect(bfl.submissions).toBe(1);
  });

  it("keeps a chain to its own session", async () => {
    const { create, base, bfl } = await studio();
    const { chain } = await create();
    const stranger = `camera_session=${randomUUID()}`;
    const as = (route: string, method = "GET", headers = {}) =>
      fetch(`${base}/api/chains${route}`, {
        method,
        headers: { cookie: stranger, ...headers },
      });
    expect((await as(`/${chain.id}`)).status).toBe(404);
    expect(
      (
        await as(`/${chain.id}/approve`, "POST", {
          "Quote-Id": chain.quote!.id,
        })
      ).status,
    ).toBe(404);
    expect((await as(`/${chain.id}/cancel`, "POST")).status).toBe(404);
    expect(await (await as("")).json()).toEqual({ chains: [] });
    expect((await as("/not-a-chain")).status).toBe(404);
    expect(bfl.submissions).toBe(0);
  });

  it("lists the owner's chains and refuses an invalid one before quoting", async () => {
    const { create, send, store } = await studio();
    await create({ stages: [{ input }], target: "phone" });
    const chains = (await send("")).chains!;
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ target: "phone", status: "paused" });
    expect(chains[0].stages[0].input).toMatchObject({
      aspectRatio: "9:16",
      resolution: "fhd",
    });
    // The list carries statuses; reading one carries its quote.
    expect(chains[0]).not.toHaveProperty("quote");
    const refused = await create({ stages: [{ input }], target: "cinema" });
    expect(refused.status).toBe(400);
    const tooMany = await create({
      stages: Array.from({ length: 7 }, () => ({ input })),
    });
    expect(tooMany.status).toBe(400);
    expect(store.data.chains).toHaveLength(1);
    expect(store.data.quotes).toHaveLength(1);
  });
});
