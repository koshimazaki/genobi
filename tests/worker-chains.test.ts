import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { APPROVAL_TIMEOUT_MS, type ChainView } from "../shared/chain";
import { RETENTION_MS } from "../shared/lifecycle";
import {
  call,
  cookie,
  faults,
  input,
  POOR_KEY,
  lastSubmission,
  mf,
  newSession,
  submissions,
  useWorker,
  type CronTrigger,
} from "./worker-harness";

// Chained jobs through the Worker against isolated D1 and R2, with migration
// 0007 applied: the same pauses, approvals, cancel and ownership as the local
// adapter, with every chain change a compare-and-set.
useWorker();

const upscale = { ...input, generator: "upscale", cameraEnabled: false };
const key = { "x-byo-key": "test-only-key" };
/** Waits until an approval of the chain's paused stage is stored. */
async function claimed(id: string) {
  const db = await mf.getD1Database("DB");
  for (let tries = 0; tries < 200; tries++) {
    const row = await db
      .prepare(
        "SELECT json_extract(data,'$.stages[0].approval.claimId') AS claim FROM chains WHERE id=?",
      )
      .bind(id)
      .first<{ claim: string | null }>();
    if (row?.claim) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The approval was never claimed.");
}
type Reply = {
  chain: ChainView;
  chains?: ChainView[];
  needsKey?: true;
  code?: string;
};

function as(session: string) {
  const send = async (
    route: string,
    init: { method?: string; body?: object; headers?: object } = {},
  ) => {
    const response = await call(`/api/chains${route}`, {
      method: init.method ?? "GET",
      headers: {
        cookie: session,
        "content-type": "application/json",
        ...(init.headers as Record<string, string>),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    return { status: response.status, ...((await response.json()) as Reply) };
  };
  return {
    send,
    create: (body: object = { stages: [{ input }, { input: upscale }] }) =>
      send("", { method: "POST", body, headers: key }),
    approve: (id: string, quoteId: string) =>
      send(`/${id}/approve`, {
        method: "POST",
        headers: { ...key, "quote-id": quoteId },
      }),
    finish: (jobId: string) =>
      call(`/api/jobs/${jobId}`, { headers: { cookie: session, ...key } }),
  };
}

describe("Cloudflare adapter chains: approval between paid stages", () => {
  it("pauses before each stage and spends each quote on exactly one run", async () => {
    const session = newSession();
    const { send, create, approve, finish } = as(session);
    const before = submissions;
    const created = await create();
    expect(created.status).toBe(201);
    const { chain } = created;
    expect(chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(chain.quote?.recipe.id).toBe("flux-3-video");
    expect(submissions).toBe(before);
    const wrong = await approve(chain.id, randomUUID());
    expect(wrong).toMatchObject({ status: 409, code: "quote_mismatch" });
    expect(submissions).toBe(before);

    // Two approvals at once: one claim, one reservation, one provider call.
    const [one, two] = await Promise.all([
      approve(chain.id, chain.quote!.id),
      approve(chain.id, chain.quote!.id),
    ]);
    // The second finds the first's claim and answers without submitting.
    expect([one.status, two.status]).toEqual([202, 202]);
    const jobId = (await send(`/${chain.id}`)).chain.stages[0].jobId!;
    expect(jobId).toEqual(expect.any(String));
    expect(submissions).toBe(before + 1);

    expect(
      (
        (await (await finish(jobId)).json()) as Reply & {
          job: { status: string };
        }
      ).job.status,
    ).toBe("Ready");
    // Reading without a key cannot price the next stage.
    const keyless = await send(`/${chain.id}`);
    expect(keyless.needsKey).toBe(true);
    expect(keyless.chain).toMatchObject({ status: "paused", pausedAt: 1 });
    expect(keyless.chain).not.toHaveProperty("quote");
    const paused = (await send(`/${chain.id}`, { headers: key })).chain;
    expect(paused.quote!.recipe.id).toBe("flux-video-upscale");
    expect(paused.quote!.id).not.toBe(chain.quote!.id);
    const reused = await approve(chain.id, chain.quote!.id);
    expect(reused).toMatchObject({ status: 409, code: "quote_mismatch" });

    const second = await approve(chain.id, paused.quote!.id);
    expect(second.status).toBe(202);
    expect(submissions).toBe(before + 2);
    // BFL reads stage 1's stored take through a capability link.
    expect(lastSubmission.input_video).toMatch(
      /^https:\/\/studio\.test\/api\/input\/[0-9a-f-]{72}$/,
    );
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT input, idempotency FROM jobs WHERE id=?")
      .bind(second.chain.stages[1].jobId)
      .first<{ input: string; idempotency: string }>();
    expect(JSON.parse(row!.input).sourceId).toBe(jobId);
    expect(row!.idempotency).toBe(`chain-${chain.id}-1`);
    await finish(second.chain.stages[1].jobId!);
    const done = await send(`/${chain.id}`, { headers: key });
    expect(done.chain.status).toBe("complete");
    expect(submissions).toBe(before + 2);
  });

  it("cancels at a pause and keeps a chain to its session", async () => {
    const session = newSession();
    const { send, create, approve } = as(session);
    const before = submissions;
    const { chain } = await create();
    const stranger = as(newSession());
    expect((await stranger.send(`/${chain.id}`, { headers: key })).status).toBe(
      404,
    );
    expect((await stranger.approve(chain.id, chain.quote!.id)).status).toBe(
      404,
    );
    expect(
      (
        await stranger.send(`/${chain.id}/cancel`, {
          method: "POST",
          headers: key,
        })
      ).status,
    ).toBe(404);
    expect((await stranger.send("")).chains).toEqual([]);
    const cancelled = await send(`/${chain.id}/cancel`, {
      method: "POST",
      headers: key,
    });
    expect(cancelled.chain.status).toBe("cancelled");
    expect((await approve(chain.id, chain.quote!.id)).code).toBe(
      "chain_cancelled",
    );
    const listed = (await send("")).chains!;
    expect(listed.map((item) => item.status)).toEqual(["cancelled"]);
    expect(submissions).toBe(before);
  });

  it("refuses an invalid chain before storing or quoting it", async () => {
    const { create } = as(newSession());
    const db = await mf.getD1Database("DB");
    const count = async () =>
      (await db.prepare("SELECT COUNT(*) AS n FROM chains").first<{
        n: number;
      }>())!.n;
    const chains = await count();
    expect(
      (await create({ stages: [{ input }], target: "cinema" })).status,
    ).toBe(400);
    expect((await create({ stages: [{ input }, { input }] })).status).toBe(400);
    expect(await count()).toBe(chains);
    const big = await create({ stages: [{ input }], target: "big-screen" });
    expect(big.chain.stages.map((stage) => stage.input.generator)).toEqual([
      "video",
      "upscale",
    ]);
    expect(big.chain.stages[0].input.resolution).toBe("qhd");
  });

  it("never lets a failed approval release another's claim, so a cancel cannot slip in", async () => {
    // The incompatible approval claims first and is held at its balance check.
    const session = newSession();
    const { send, create, approve } = as(session);
    const before = submissions;
    const { chain } = await create({ stages: [{ input }] });
    let open!: () => void;
    faults.holdCredits = new Promise((resolve) => (open = resolve));
    try {
      const poor = send(`/${chain.id}/approve`, {
        method: "POST",
        headers: { "x-byo-key": POOR_KEY, "quote-id": chain.quote!.id },
      });
      await claimed(chain.id);
      // The compatible approval finds that claim and sends nothing.
      const good = await approve(chain.id, chain.quote!.id);
      expect(good.status).toBe(202);
      expect(good.chain.stages[0].status).toBe("submitting");
      open();
      expect((await poor).status).toBe(402);
    } finally {
      faults.holdCredits = null;
    }
    // Only the failed approval's own claim went, so the pause is real.
    const cancelled = await send(`/${chain.id}/cancel`, {
      method: "POST",
      headers: key,
    });
    expect(cancelled.chain.status).toBe("cancelled");
    expect(submissions).toBe(before);
  });

  it("refuses a cancel while another approval's claim is still running", async () => {
    // The compatible approval claims first, of an upscale a Comfy key cannot run.
    const { send, create, approve } = as(cookie);
    const before = submissions;
    const source = { ...upscale, sourceId: "fixture-source" };
    const { chain } = await create({ stages: [{ input: source }] });
    let open!: () => void;
    faults.holdCredits = new Promise((resolve) => (open = resolve));
    let good: Promise<Reply & { status: number }>;
    try {
      good = approve(chain.id, chain.quote!.id);
      await claimed(chain.id);
      const comfy = await send(`/${chain.id}/approve`, {
        method: "POST",
        headers: {
          "x-byo-key": "comfyui-test-key-0003",
          "quote-id": chain.quote!.id,
        },
      });
      expect(comfy.status).toBe(202);
      const refused = await send(`/${chain.id}/cancel`, {
        method: "POST",
        headers: key,
      });
      expect(refused).toMatchObject({ status: 409, code: "chain_not_paused" });
      expect(submissions).toBe(before);
    } finally {
      open();
      faults.holdCredits = null;
    }
    expect((await good).status).toBe(202);
    expect(submissions).toBe(before + 1);
    expect((await send(`/${chain.id}`)).chain.status).toBe("running");
  });

  it("pauses a lost approval again once its quote can no longer be spent", async () => {
    const { send, create, approve } = as(newSession());
    const before = submissions;
    const { chain } = await create({ stages: [{ input }] });
    const db = await mf.getD1Database("DB");
    // An approval stored, then its request lost before any reservation.
    const lost = new Date(
      Date.now() - APPROVAL_TIMEOUT_MS - 1000,
    ).toISOString();
    await db
      .prepare(
        `UPDATE chains SET data=json_set(data,'$.stages[0].approval',json(?)),
        revision=revision+1 WHERE id=?`,
      )
      .bind(
        JSON.stringify({ quoteId: chain.quote!.id, claimId: "lost", at: lost }),
        chain.id,
      )
      .run();
    const keyless = await send(`/${chain.id}`);
    expect(keyless.chain).toMatchObject({ status: "paused", pausedAt: 0 });
    // The old quote is gone with its approval; a fresh one is approved once.
    await db
      .prepare("UPDATE quotes SET expires=0 WHERE id=?")
      .bind(chain.quote!.id)
      .run();
    const fresh = (await send(`/${chain.id}`, { headers: key })).chain.quote!;
    expect(fresh.id).not.toBe(chain.quote!.id);
    expect((await approve(chain.id, fresh.id)).status).toBe(202);
    expect(submissions).toBe(before + 1);
    const row = await db
      .prepare("SELECT data FROM chains WHERE id=?")
      .bind(chain.id)
      .first<{ data: string }>();
    expect(JSON.parse(row!.data).stages[0].approval.claimId).not.toBe("lost");
  });

  it("retires chains with the jobs they ran", async () => {
    const db = await mf.getD1Database("DB");
    await db
      .prepare(
        "INSERT INTO chains (id,session,data,created_at) VALUES ('old-chain','s','{}',?)",
      )
      .bind(Date.now() - RETENTION_MS - 1000)
      .run();
    await db.prepare("DELETE FROM rate_limits WHERE id='sweep'").run();
    const worker = (await mf.getWorker()) as unknown as CronTrigger;
    await worker.scheduled({ scheduledTime: new Date(), cron: "*/5 * * * *" });
    expect(
      await db.prepare("SELECT id FROM chains WHERE id='old-chain'").first(),
    ).toBeNull();
  });
});
