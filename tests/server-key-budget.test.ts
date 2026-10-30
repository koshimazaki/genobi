import { describe, expect, it } from "vitest";
import { runCredential, ServerKeys } from "../server/keys";
import type { StoredJob } from "../server/store";
import type { KeyKind } from "../shared/provider";
import {
  BFL,
  COMFY,
  FakeKeychain,
  fakeComfy,
  saveKey,
  session,
  startKeyServer,
} from "./keys-harness";
import { input } from "./server-harness";

// The demo budget (three runs a session, $5 a day) is for the studio's own
// demo key. A key the owner saved in the Keychain spends the owner's credits,
// so neither a quote nor a submission on it is held to that budget.
const big = { ...input, duration: 10, resolution: "uhd" };

describe("whose key a run spends", () => {
  it("tells the environment's demo key from the owner's saved key", async () => {
    const keychain = new FakeKeychain();
    keychain.items.set("bfl", BFL);
    const keys = ServerKeys.fromEnvironment({ COMFY_API_KEY: COMFY }, keychain);
    await keys.load();
    expect(runCredential(keys, "video", "flux-3")).toEqual({
      key: BFL,
      mode: "owner",
    });
    expect(runCredential(keys, "video", "ltx-2.5")).toEqual({
      key: COMFY,
      mode: "server",
    });
    expect(runCredential(keys, "image", "flux-3-klein-api")).toEqual({
      key: BFL,
      mode: "owner",
    });
    expect(runCredential(keys, "video", "flux-3", "bfl-visitor-key")).toEqual({
      key: "bfl-visitor-key",
      mode: "byo",
    });
    expect(() => runCredential(new ServerKeys(), "video", "flux-3")).toThrow();
  });
});

describe("the demo budget and the owner's saved key", () => {
  it("runs a fourth run in a session on a key saved in the Keychain", async () => {
    const { provider, calls } = fakeComfy();
    const { base } = await startKeyServer(
      new ServerKeys({}, new FakeKeychain()),
      provider,
    );
    expect((await saveKey(base, "comfy", COMFY)).status).toBe(200);
    const studio = await session(base);
    for (let run = 0; run < 3; run++)
      expect((await studio.submit(input)).status).toBe(202);
    // The fourth: its quote and its submission agree.
    const quoted = await studio.quote(input);
    expect(quoted.status).toBe(201);
    const fourth = await studio.submit(input, {
      "Quote-Id": (await quoted.json()).quote.id,
    });
    expect(fourth.status).toBe(202);
    expect((await fourth.json()).job.keyMode).toBe("owner");
    expect(calls.submit).toEqual(Array(4).fill(COMFY));
    // The owner's runs leave the demo budget untouched.
    const budget = await (
      await fetch(`${base}/api/budget`, { headers: { Cookie: studio.cookie } })
    ).json();
    expect(budget).toMatchObject({ runsLeft: 3, usdLeft: 5 });
  });

  it("runs one run over the whole $5 day budget on the owner's key", async () => {
    const { provider, calls } = fakeComfy();
    const { base } = await startKeyServer(
      new ServerKeys({}, new FakeKeychain()),
      provider,
    );
    await saveKey(base, "comfy", COMFY);
    const studio = await session(base);
    const bigQuote = await studio.quote(big);
    expect(bigQuote.status).toBe(201);
    const { quote } = await bigQuote.json();
    expect(quote.estimateUsd).toBeGreaterThan(5);
    const bigRun = await studio.submit(big, { "Quote-Id": quote.id });
    expect(bigRun.status).toBe(202);
    expect(calls.submit).toEqual([COMFY]);
  });

  it("still holds the environment's demo key to the budget, quote and submit alike", async () => {
    const { provider, calls } = fakeComfy();
    const { base } = await startKeyServer(
      new ServerKeys({ comfy: COMFY }),
      provider,
    );
    const studio = await session(base);
    for (let run = 0; run < 3; run++) {
      const sent = await studio.submit(input);
      expect(sent.status).toBe(202);
      expect((await sent.json()).job.keyMode).toBe("server");
    }
    const quoted = await studio.quote(input);
    expect(quoted.status).toBe(429);
    expect((await quoted.json()).code).toBe("budget");
    const fourth = await studio.submit(input);
    expect(fourth.status).toBe(429);
    expect((await fourth.json()).code).toBe("budget");
    // A fresh session's single run over $5 is refused the same way.
    const other = await session(base);
    expect((await other.quote(big)).status).toBe(429);
    expect((await other.submit(big)).status).toBe(429);
    expect(calls.submit).toHaveLength(3);
  });

  it("keeps a run on the owner's key polling without a page key", async () => {
    const { provider, calls } = fakeComfy();
    const { base } = await startKeyServer(
      new ServerKeys({}, new FakeKeychain()),
      provider,
    );
    await saveKey(base, "comfy", COMFY);
    const studio = await session(base);
    const { job } = await (await studio.submit(input)).json();
    const polled = await (await studio.poll(job.id)).json();
    expect(polled.needsKey).toBeUndefined();
    expect(calls.poll).toEqual([COMFY]);
  });
});

describe("a run started on a page key, after the owner saves one", () => {
  it("waits for that key and resumes when the page sends it again", async () => {
    const { provider, calls } = fakeComfy();
    const { base } = await startKeyServer(
      new ServerKeys({}, new FakeKeychain()),
      provider,
    );
    const page = "comfyui-page-key-0123456789";
    const studio = await session(base);
    const { job } = await (
      await studio.submit(input, { "x-byo-key": page })
    ).json();
    expect(job.keyMode).toBe("byo");
    // Saving a key in the Keychain does not adopt the visitor's run: that
    // could be another account, where a poll would read the run as lost.
    await saveKey(base, "comfy", COMFY);
    expect((await (await studio.poll(job.id)).json()).needsKey).toBe(true);
    expect(calls.poll).toEqual([]);
    // The dialogue's reconnection hands the page its key again.
    const resumed = await (
      await studio.poll(job.id, { "x-byo-key": page })
    ).json();
    expect(resumed.needsKey).toBeUndefined();
    expect(calls.poll).toEqual([page]);
  });
});

describe("changing a saved key while a run on it finishes", () => {
  it("refuses a replacement or removal until the run is done", async () => {
    const { provider, calls } = fakeComfy();
    const keychain = new FakeKeychain();
    const { base, service } = await startKeyServer(
      new ServerKeys({}, keychain),
      provider,
    );
    await saveKey(base, "comfy", COMFY);
    const studio = await session(base);
    const { job } = await (await studio.submit(input)).json();
    expect(job.keyMode).toBe("owner");
    const replaced = await saveKey(base, "comfy", "comfyui-other-account-key");
    expect(replaced.status).toBe(409);
    expect(await replaced.json()).toMatchObject({ code: "key_in_use" });
    const removed = await fetch(`${base}/api/keys/comfy`, { method: "DELETE" });
    expect(removed.status).toBe(409);
    expect(keychain.items.get("comfy")).toBe(COMFY);
    // The run is still polled with the key it was sent on.
    await studio.poll(job.id);
    expect(calls.poll).toEqual([COMFY]);
    // A finished run frees the slot; the BFL slot was never held.
    expect((await saveKey(base, "bfl", BFL)).status).toBe(200);
    service.store.data.jobs[0].status = "Ready";
    expect(
      (await saveKey(base, "comfy", "comfyui-other-account-key")).status,
    ).toBe(200);
  });
});

/** A Keychain whose next write stays open until the test lets it finish. */
class HeldKeychain extends FakeKeychain {
  entered!: Promise<void>;
  private release!: () => void;
  private arrived!: () => void;
  hold() {
    this.entered = new Promise((resolve) => (this.arrived = resolve));
    const gate = new Promise<void>((resolve) => (this.release = resolve));
    const write = this.write.bind(this);
    this.write = async (kind, key) => {
      this.arrived();
      await gate;
      this.write = write;
      return write(kind, key);
    };
    return () => this.release();
  }
}

describe("a run and a key change at the same moment", () => {
  it("waits for the change and runs, then polls, on the new key", async () => {
    const { provider, calls } = fakeComfy();
    const keychain = new HeldKeychain();
    const { base } = await startKeyServer(
      new ServerKeys({}, keychain),
      provider,
    );
    await saveKey(base, "comfy", COMFY);
    const studio = await session(base);
    const next = "comfyui-replacement-0123456789";
    const release = keychain.hold();
    const replacing = saveKey(base, "comfy", next);
    await keychain.entered;
    // The run arrives while the Keychain write is still open.
    const submitting = studio.submit(input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.submit).toEqual([]);
    release();
    expect((await replacing).status).toBe(200);
    const { job } = await (await submitting).json();
    expect(calls.submit).toEqual([next]);
    await studio.poll(job.id);
    expect(calls.poll).toEqual([next]);
  });

  it("holds a change behind a run choosing its key, then refuses it", async () => {
    const keychain = new FakeKeychain();
    const keys = new ServerKeys({}, keychain);
    const { base, service } = await startKeyServer(keys);
    await saveKey(base, "comfy", COMFY);
    // A run that chose the saved key and is still being reserved: it records
    // its job (all `finishingOn` reads) as its reservation ends.
    const choosing = {
      keyMode: "owner",
      status: "submitting",
      take: { recipe: { id: "x", version: 1, route: "router" }, inputs: [] },
    } as unknown as StoredJob;
    let record!: () => void;
    const reservation = keys.reserving(
      () =>
        new Promise<void>((resolve) => {
          record = () => {
            service.store.data.jobs.push(choosing);
            resolve();
          };
        }),
    );
    let settled = false;
    const replacing = saveKey(base, "comfy", "comfyui-replacement-0123").then(
      (response) => {
        settled = true;
        return response;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    record();
    await reservation;
    const refused = await replacing;
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "key_in_use" });
    expect(keychain.items.get("comfy")).toBe(COMFY);
  });
});

describe("a demo-key run after its key moved into the Keychain", () => {
  it("holds the saved slot until the run, polled through it, finishes", async () => {
    const before = fakeComfy();
    const first = await startKeyServer(
      new ServerKeys({ comfy: COMFY }),
      before.provider,
    );
    const studio = await session(first.base);
    const { job } = await (await studio.submit(input)).json();
    expect(job.keyMode).toBe("server");
    // Restart with the same key saved in the Keychain, not the environment.
    const keychain = new FakeKeychain();
    keychain.items.set("comfy", COMFY);
    const after = fakeComfy();
    const second = await startKeyServer(
      new ServerKeys({}, keychain),
      after.provider,
      first.directory,
    );
    const health = await fetch(`${second.base}/api/health`);
    expect(await health.json()).toMatchObject({ keysRevision: "0.0" });
    const replaced = await saveKey(
      second.base,
      "comfy",
      "comfyui-other-account-key",
    );
    expect(replaced.status).toBe(409);
    expect(await replaced.json()).toMatchObject({ code: "key_in_use" });
    const removed = await fetch(`${second.base}/api/keys/comfy`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(409);
    expect(keychain.items.get("comfy")).toBe(COMFY);
    // The job still polls with the key it was sent on.
    await fetch(`${second.base}/api/jobs/${job.id}`, {
      headers: { Cookie: studio.cookie },
    });
    expect(after.calls.poll).toEqual([COMFY]);
    // Once it finishes, the slot changes, and its revision moves.
    second.service.store.data.jobs[0].status = "Ready";
    expect(
      (await saveKey(second.base, "comfy", "comfyui-other-account-key")).status,
    ).toBe(200);
    const moved = await fetch(`${second.base}/api/health`);
    expect(await moved.json()).toMatchObject({ keysRevision: "1.0" });
  });
});

/** A Keychain whose next `failReads` reads fail, as a locked one does. */
class LockedKeychain extends FakeKeychain {
  constructor(public failReads: number) {
    super();
    this.items.set("comfy", COMFY);
  }
  override async read(kind: KeyKind) {
    if (this.failReads > 0) {
      this.failReads--;
      throw new Error("keychain_unavailable");
    }
    return super.read(kind);
  }
}

describe("a saved key the Keychain could not read at startup", () => {
  /** A run sent on the saved key, then a restart whose Keychain read fails. */
  async function restartLocked(failReads: number) {
    const first = await startKeyServer(
      new ServerKeys({}, new FakeKeychain()),
      fakeComfy().provider,
    );
    await saveKey(first.base, "comfy", COMFY);
    const studio = await session(first.base);
    const { job } = await (await studio.submit(input)).json();
    expect(job.keyMode).toBe("owner");
    const keychain = new LockedKeychain(failReads);
    const after = fakeComfy();
    const second = await startKeyServer(
      new ServerKeys({}, keychain),
      after.provider,
      first.directory,
    );
    const poll = () =>
      fetch(`${second.base}/api/jobs/${job.id}`, {
        headers: { Cookie: studio.cookie },
      });
    // Nothing to poll with until the slot is read again.
    expect((await poll()).status).toBe(400);
    expect(after.calls.poll).toEqual([]);
    return { base: second.base, keychain, poll, calls: after.calls };
  }

  it("reads the item again on a change, then guards the key it found", async () => {
    const { base, keychain, poll, calls } = await restartLocked(1);
    const other = await saveKey(base, "comfy", "comfyui-other-account-key");
    expect(other.status).toBe(409);
    expect(keychain.items.get("comfy")).toBe(COMFY);
    expect((await poll()).status).toBe(200);
    expect(calls.poll).toEqual([COMFY]);
  });

  it("accepts the same key entered again", async () => {
    const { base, poll, calls } = await restartLocked(1);
    const again = await saveKey(base, "comfy", COMFY);
    expect(again.status).toBe(200);
    expect(await again.text()).not.toContain(COMFY);
    expect((await poll()).status).toBe(200);
    expect(calls.poll).toEqual([COMFY]);
  });

  it("fills a slot it still cannot read, and leaves it alone on removal", async () => {
    const { base, keychain, poll, calls } = await restartLocked(10);
    const removed = await fetch(`${base}/api/keys/comfy`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(keychain.items.get("comfy")).toBe(COMFY);
    expect((await saveKey(base, "comfy", COMFY)).status).toBe(200);
    expect((await poll()).status).toBe(200);
    expect(calls.poll).toEqual([COMFY]);
  });
});
