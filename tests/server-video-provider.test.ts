import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AppError } from "../server/errors";
import { ServerKeys } from "../server/keys";
import { COMFY, FakeKeychain, fakeComfy, session } from "./keys-harness";
import { input, setup } from "./server-harness";

async function fixture() {
  const keychain = new FakeKeychain();
  keychain.items.set("bfl", "test-server-key");
  keychain.items.set("comfy", COMFY);
  const keys = new ServerKeys({}, keychain);
  await keys.load();
  const comfy = fakeComfy();
  const app = await setup(
    undefined,
    undefined,
    undefined,
    keys,
    undefined,
    comfy.provider,
  );
  return { ...app, comfy, keys, user: await session(app.base) };
}

describe("local FLUX video provider selection", () => {
  it("quotes and submits exactly the selected owner slot, keeping Auto BFL-first", async () => {
    const { user, comfy, bfl, store } = await fixture();
    for (const videoProvider of ["auto", "comfy", "bfl"] as const) {
      const body = { ...input, videoProvider };
      const quoted = await user.quote(body);
      expect(quoted.status).toBe(201);
      const { quote } = await quoted.json();
      expect(quote.recipe.route).toBe(
        videoProvider === "comfy" ? "router" : "bfl",
      );
      const submitted = await user.submit(body, { "quote-id": quote.id });
      expect(submitted.status).toBe(202);
      const { job } = await submitted.json();
      expect(job.videoProvider).toBe(videoProvider);
      expect((await user.poll(job.id)).status).toBe(200);
    }
    expect(bfl.submissions).toBe(2);
    expect(comfy.calls.submit).toEqual([COMFY]);
    expect(comfy.calls.poll).toEqual([COMFY]);
    expect(bfl.polls).toBe(2);
    expect(store.data.jobs.map((j) => j.take?.recipe.route).sort()).toEqual([
      "bfl",
      "bfl",
      "router",
    ]);
  });

  it("refuses wrong or missing provider keys and changed quotes without submitting", async () => {
    const { user, comfy, bfl, keys } = await fixture();
    const body = { ...input, videoProvider: "comfy" };
    expect(
      (await user.quote(body, { "x-byo-key": "test-server-key" })).status,
    ).toBe(400);
    const { quote } = await (await user.quote(body)).json();
    const changed = await user.submit(
      { ...body, videoProvider: "bfl" },
      { "quote-id": quote.id },
    );
    expect(changed.status).toBe(409);
    await keys.remove("comfy");
    expect((await user.quote(body)).status).toBe(400);
    expect(comfy.calls.submit).toHaveLength(0);
    expect(bfl.submissions).toBe(0);
  });

  it("replays an uncertain Router attempt without fallback, even when BFL is available", async () => {
    const { user, comfy, bfl } = await fixture();
    let calls = 0;
    comfy.provider.submit = async () => {
      calls++;
      throw new AppError(502, "Submission uncertain.", "submission_unknown");
    };
    const body = { ...input, videoProvider: "comfy" };
    const headers = { "Idempotency-Key": "video-provider-uncertain" };
    const first = await (await user.submit(body, headers)).json();
    expect(first.job.status).toBe("Error");
    const replay = await (await user.submit(body, headers)).json();
    expect(replay.job.id).toBe(first.job.id);
    expect(calls).toBe(1);
    expect(bfl.submissions).toBe(0);
  });

  it("holds BYO polling for its original provider without poisoning the job", async () => {
    const { user, comfy, bfl } = await fixture();
    const { job } = await (
      await user.submit(
        { ...input, videoProvider: "comfy" },
        { "x-byo-key": COMFY },
      )
    ).json();
    const wrong = await (
      await user.poll(job.id, { "x-byo-key": "test-server-key" })
    ).json();
    expect(wrong).toMatchObject({ needsKey: true, job: { status: "Pending" } });
    expect(comfy.calls.poll).toHaveLength(0);
    expect(bfl.polls).toBe(0);
    expect(
      (await (await user.poll(job.id, { "x-byo-key": COMFY })).json()).job
        .status,
    ).toBe("Generating");
    expect(comfy.calls.poll).toEqual([COMFY]);
  });

  it("carries an upscale override with inspected source media", async () => {
    const { user, base, comfy, bfl } = await fixture();
    const upload = await fetch(`${base}/api/uploads?filename=up.mp4`, {
      method: "POST",
      headers: { cookie: user.cookie, "content-type": "video/mp4" },
      body: new Uint8Array(await readFile("tests/fixtures/metadata.mp4")),
    });
    const { source } = await upload.json();
    const body = {
      ...input,
      generator: "upscale",
      sourceId: source.id,
      videoProvider: "comfy",
    };
    const { quote } = await (await user.quote(body)).json();
    expect(quote.recipe.route).toBe("router");
    expect((await user.submit(body, { "quote-id": quote.id })).status).toBe(
      202,
    );
    expect(comfy.calls.submit).toEqual([COMFY]);
    expect(bfl.submissions).toBe(0);
  });
});
