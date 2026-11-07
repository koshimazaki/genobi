import { describe, expect, it } from "vitest";
import {
  call,
  faults,
  input,
  newSession,
  routerRequests,
  submissions,
  useWorker,
} from "./worker-harness";

useWorker();
const comfy = "comfyui-test-video-provider";
const bfl = "test-only-key";
const json = (body: object) => JSON.stringify(body);
function client() {
  const cookie = newSession();
  const quote = (body: object, key: string) =>
    call("/api/quotes", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-byo-key": key },
      body: json(body),
    });
  const submit = (body: object, key: string, id: string, quoteId?: string) =>
    call("/api/jobs", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        "x-byo-key": key,
        "idempotency-key": id,
        ...(quoteId ? { "quote-id": quoteId } : {}),
      },
      body: json(body),
    });
  const poll = (id: string, key: string) =>
    call(`/api/jobs/${id}`, { headers: { cookie, "x-byo-key": key } });
  return { quote, submit, poll };
}

describe("hosted FLUX video provider selection", () => {
  it("binds the quote, reservation and submit to the explicit BYO provider", async () => {
    const user = client();
    const before = { bfl: submissions, router: routerRequests.length };
    const body = { ...input, videoProvider: "comfy" };
    expect((await user.quote(body, bfl)).status).toBe(400);
    const quoted = await user.quote(body, comfy);
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as {
      quote: { id: string; recipe: { route: string } };
    };
    expect(quote.recipe.route).toBe("router");
    expect(
      (
        await user.submit(
          { ...body, videoProvider: "bfl" },
          bfl,
          "provider-change",
          quote.id,
        )
      ).status,
    ).toBe(409);
    const submitted = await user.submit(
      body,
      comfy,
      "provider-router",
      quote.id,
    );
    expect(submitted.status).toBe(202);
    const { job } = (await submitted.json()) as {
      job: { id: string; videoProvider: string };
    };
    expect(job.videoProvider).toBe("comfy");
    expect(routerRequests.length).toBe(before.router + 1);
    expect(submissions).toBe(before.bfl);
    const wrong = await (await user.poll(job.id, bfl)).json();
    expect(wrong).toMatchObject({ needsKey: true, job: { status: "Pending" } });
    // Wrong-provider reads never acquire the polling lease or poison the run.
    expect((await user.submit(body, comfy, "provider-router")).status).toBe(
      202,
    );
    expect(routerRequests.length).toBe(before.router + 1);
  });

  it("keeps legacy Auto replay compatible and polls BFL only with a BFL key", async () => {
    const user = client();
    const before = submissions;
    const response = await user.submit(input, bfl, "legacy-video-provider");
    expect(response.status).toBe(202);
    const { job } = (await response.json()) as { job: { id: string } };
    expect(
      (
        await user.submit(
          { ...input, videoProvider: "auto" },
          bfl,
          "legacy-video-provider",
        )
      ).status,
    ).toBe(202);
    expect(submissions).toBe(before + 1);
    expect(await (await user.poll(job.id, comfy)).json()).toMatchObject({
      needsKey: true,
      job: { status: "Pending" },
    });
    expect(await (await user.poll(job.id, bfl)).json()).toMatchObject({
      job: { status: "Ready" },
    });
  });

  it("never sends an uncertain BFL request to Router or resends its request id", async () => {
    const user = client();
    const before = { bfl: submissions, router: routerRequests.length };
    faults.failSubmit = true;
    try {
      const body = { ...input, videoProvider: "bfl" };
      const response = await user.submit(body, bfl, "provider-uncertain");
      expect(response.status).toBe(202);
      const first = (await response.json()) as {
        job: { id: string; status: string };
      };
      expect(first.job.status).toBe("Error");
      const replay = (await (
        await user.submit(body, bfl, "provider-uncertain")
      ).json()) as { job: { id: string } };
      expect(replay.job.id).toBe(first.job.id);
      expect(submissions).toBe(before.bfl + 1);
      expect(routerRequests.length).toBe(before.router);
    } finally {
      faults.failSubmit = false;
    }
  });
});
