import { describe, expect, it } from "vitest";
import { SESSION_LIMIT } from "../server/jobs";
import { ServerKeys } from "../server/keys";
import { COMFY, FakeKeychain, saveKey } from "./keys-harness";
import { klein, png, studio } from "./run-location-harness";

// Local ComfyUI runs and the key slots: a local run is free, never counted,
// and needs no provider key on any path, while a cloud run keeps the rules
// of the key it was sent on.
const ownerKeys = () => {
  const keychain = new FakeKeychain();
  keychain.items.set("comfy", COMFY);
  return new ServerKeys({}, keychain);
};

describe("local runs and the demo budget", () => {
  it("never counts a local run, on the owner's saved key or the demo key", async () => {
    const { send, base, fake } = await studio([], ownerKeys());
    await send("/api/settings/run-location", { location: "local" });
    for (let n = 0; n < SESSION_LIMIT + 1; n++) {
      const { job } = await (
        await send("/api/jobs", klein, {
          "Idempotency-Key": `owner-local-${n}`,
        })
      ).json();
      expect(job).toMatchObject({ status: "Pending", keyMode: "owner" });
    }
    expect(fake.prompts).toHaveLength(SESSION_LIMIT + 1);
    expect(await (await send("/api/budget")).json()).toMatchObject({
      payer: "owner",
      runsLeft: SESSION_LIMIT,
      reservedUsd: 0,
      countsLocalRuns: false,
    });
    // No key reaches a local run, so a pending one does not hold the slot.
    expect(
      (await saveKey(base, "comfy", "comfyui-replacement-key")).status,
    ).toBe(200);
  });

  it("still counts a cloud run on the demo key", async () => {
    const { send, cloudRuns } = await studio(
      [],
      new ServerKeys({ comfy: COMFY }),
    );
    const { job } = await (
      await send("/api/jobs", klein, { "Idempotency-Key": "demo-cloud-1" })
    ).json();
    expect(job).toMatchObject({ status: "Pending", keyMode: "server" });
    expect(cloudRuns()).toBe(1);
    const budget = await (await send("/api/budget")).json();
    expect(budget).toMatchObject({
      payer: "server",
      runsLeft: SESSION_LIMIT - 1,
    });
    expect(budget.reservedUsd).toBeGreaterThan(0);
  });
});

describe("a local run without any key", () => {
  it("polls to Ready and saves its output after the last saved key is removed", async () => {
    const { send, base, fake } = await studio([], ownerKeys());
    await send("/api/settings/run-location", { location: "local" });
    const { job } = await (
      await send("/api/jobs", klein, { "Idempotency-Key": "keyless-local-1" })
    ).json();
    expect(job).toMatchObject({ status: "Pending", keyMode: "owner" });
    const removed = await fetch(`${base}/api/keys/comfy`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect((await removed.json()).keys.comfy.connected).toBe(false);
    fake.state = "success";
    const polled = await send(`/api/jobs/${job.id}`);
    expect(polled.status).toBe(200);
    const { job: ready } = await polled.json();
    expect(ready).toMatchObject({
      status: "Ready",
      resultContentType: "image/png",
    });
    const clip = await send(ready.resultUrl);
    expect(new Uint8Array(await clip.arrayBuffer())).toEqual(
      new Uint8Array(png),
    );
  });

  it("is resumed by recovery after a restart with no key at all", async () => {
    const first = await studio([], ownerKeys());
    await first.send("/api/settings/run-location", { location: "local" });
    const { job } = await (
      await first.send("/api/jobs", klein, {
        "Idempotency-Key": "keyless-local-2",
      })
    ).json();
    first.fake.state = "success";
    const second = await studio([], new ServerKeys(), {
      fake: first.fake,
      directory: first.directory,
    });
    expect(second.service.hasServerKey).toBe(false);
    await second.service.resumeServerJobs();
    const resumed = second.service.store.data.jobs.find(
      (item) => item.id === job.id,
    );
    expect(resumed).toMatchObject({ status: "Ready" });
  });

  it("still refuses a cloud run's poll with no key", async () => {
    const first = await studio([], ownerKeys());
    const { job } = await (
      await first.send("/api/jobs", klein, {
        "Idempotency-Key": "keyless-cloud-1",
      })
    ).json();
    expect(job).toMatchObject({ status: "Pending", keyMode: "owner" });
    const second = await studio([], new ServerKeys(), {
      fake: first.fake,
      directory: first.directory,
    });
    const polled = await fetch(`${second.base}/api/jobs/${job.id}`, {
      headers: { cookie: first.cookie },
    });
    expect(polled.status).toBe(400);
    expect(await polled.json()).toMatchObject({ code: "invalid_key" });
    await second.service.resumeServerJobs();
    expect(
      second.service.store.data.jobs.find((item) => item.id === job.id),
    ).toMatchObject({ status: "Pending" });
  });
});
