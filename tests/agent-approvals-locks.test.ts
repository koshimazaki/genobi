// Confirm before spending, second review: the approved payer is compared
// under the key lock that chooses the credential; an approved upscale reads
// the agent's quoted source for that one submission; voiding a quote saves
// before it answers. Fakes only: nothing is paid.
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approvalService } from "../server/agent-approval-service";
import type { Keychain } from "../server/keychain";
import { ServerKeys } from "../server/keys";
import type { Store } from "../server/store";
import type { JobService } from "../server/jobs";
import { flux, quoted } from "./agent-approvals-harness";
import { FakeBfl, input } from "./server-harness";

afterEach(() => vi.restoreAllMocks());

describe("approving under the key lock", () => {
  it("refuses, rather than submits with another payer, when a key write lands first", async () => {
    let release!: () => void;
    let writing!: () => void;
    const written = new Promise<void>((resolve) => (writing = resolve));
    const keychain: Keychain = {
      read: async () => undefined,
      write: () => {
        writing();
        return new Promise<void>((resolve) => (release = resolve));
      },
      remove: async () => {},
    };
    const bfl = new FakeBfl();
    const router = new FakeBfl();
    const { studio, person, approval, step } = await quoted(flux, {
      app: {
        keys: new ServerKeys({ comfy: "comfyui-test-key-0012" }, keychain),
        providers: { bfl, comfy: router },
      },
    });
    expect(approval.payer).toBe("server");
    // The person saves a BFL override key of their own; the Keychain write is held.
    const saving = fetch(`${studio.base}/api/keys/bfl`, {
      method: "PUT",
      headers: { cookie: person, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "test-server-key" }),
    });
    await written;
    const approving = step(approval.quoteId, "approve");
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    expect((await saving).status).toBe(200);
    const refused = await approving;
    expect(refused).toMatchObject({
      status: 409,
      body: { code: "payer_changed" },
    });
    expect(bfl.submissions + router.submissions).toBe(0);
  });
});

describe("approving after a key moved the run to another provider", () => {
  it("refuses with route_changed when both keys are the owner's", async () => {
    // The owner saved a Comfy key; FLUX 3 is quoted on Router.
    const saved: Record<string, string> = { comfy: "comfyui-test-key-0012" };
    const keychain: Keychain = {
      read: async (kind) => saved[kind],
      write: async (kind, key) => void (saved[kind] = key),
      remove: async (kind) => void delete saved[kind],
    };
    const bfl = new FakeBfl();
    const router = new FakeBfl();
    const { studio, person, approval, step } = await quoted(flux, {
      app: {
        keys: new ServerKeys({}, keychain),
        providers: { bfl, comfy: router },
      },
    });
    expect(approval).toMatchObject({
      payer: "owner",
      plan: { route: "router" },
    });
    // Then a BFL key, also the owner's: FLUX 3 would now use BFL direct.
    const saving = await fetch(`${studio.base}/api/keys/bfl`, {
      method: "PUT",
      headers: { cookie: person, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "test-server-key" }),
    });
    expect(saving.status).toBe(200);
    const refused = await step(approval.quoteId, "approve");
    expect(refused).toMatchObject({
      status: 409,
      body: { code: "route_changed" },
    });
    expect(bfl.submissions + router.submissions).toBe(0);
  });
});

describe("an approved upscale of the agent's own clip", () => {
  it("reads that source for the one submission, and nothing else changes owner", async () => {
    const clip = path.resolve("tests/fixtures/metadata.mp4");
    const { studio, person, approval, step } = await quoted(
      {
        ...input,
        generator: "upscale",
        sourceId: "SOURCE",
        upscaleFactor: 2,
      },
      {},
      `upload ${clip}`,
    );
    const sourceId = approval.plan.upscale!.sourceId;
    // The person's own session cannot quote the agent's clip.
    const direct = await fetch(`${studio.base}/api/quotes`, {
      method: "POST",
      headers: { cookie: person, "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, generator: "upscale", sourceId }),
    });
    expect(direct.status).toBe(404);
    const approved = await step(approval.quoteId, "approve");
    expect(approved.status).toBe(202);
    expect(approved.body.job.sourceId).toBe(sourceId);
    expect(studio.bfl.submissions).toBe(1);
    // The source stays the agent's: the person's history does not list it.
    const history = await (
      await fetch(`${studio.base}/api/history`, { headers: { cookie: person } })
    ).json();
    expect(
      (history.sources as { id: string }[]).some((s) => s.id === sourceId),
    ).toBe(false);
  });
});

describe("an approval whose final save fails after the provider accepted", () => {
  it("keeps the reserved run, reachable and never sent twice", async () => {
    const { studio, person, id, approval, step } = await quoted();
    const save = studio.store.save.bind(studio.store);
    let failed = false;
    vi.spyOn(studio.store, "save").mockImplementation(async () => {
      // The save after the provider call: the outcome is now uncertain.
      if (studio.bfl.submissions === 1 && !failed) {
        failed = true;
        throw new Error("disk full");
      }
      return save();
    });
    const approved = await step(approval.quoteId, "approve");
    expect(approved.status).toBe(500);
    expect(failed).toBe(true);
    const { body } = await studio.call(person, `/sessions/${id}`);
    const settled = body.approvals[0];
    expect(settled.status).toBe("uncertain");
    expect(settled.jobId).toEqual(expect.any(String));
    // The person's gallery can read that run.
    const read = await fetch(`${studio.base}/api/jobs/${settled.jobId}`, {
      headers: { cookie: person },
    });
    expect(read.status).toBe(200);
    // A second Approve finds the step closed; nothing is sent again.
    expect((await step(approval.quoteId, "approve")).body.code).toBe(
      "approval_closed",
    );
    expect(studio.bfl.submissions).toBe(1);
  });
});

describe("voiding a quote", () => {
  it("answers only once the store is saved, and a failed save reaches the caller", async () => {
    const store = {
      data: { quotes: [{ id: "q1", sessionId: "agent" }] },
      save: async () => {
        throw new Error("disk full");
      },
    } as unknown as Store;
    const service = approvalService(
      store,
      new ServerKeys(),
      {} as unknown as JobService,
    );
    await expect(service.void("q1", "agent")).rejects.toThrow("disk full");
    expect(store.data.quotes).toEqual([]);
  });
});
