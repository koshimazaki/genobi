import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ComfyRouter } from "../shared/comfy/router";
import { input, setup } from "./server-harness";

// The local server's upscale on a Comfy key: quoted, reserved and sent to
// Router's bfl/video-upscale-v1 with the source inline, on a fake fetcher.
const comfyKey = { "x-byo-key": "comfyui-test-key-0003" };
const statusUrl =
  "https://api.comfy.org/v2/models/bfl/video-upscale-v1/requests/req_up/status";
const fixture = path.resolve("tests/fixtures/metadata.mp4");

async function upscaleSetup(answer: () => Promise<Response>) {
  const fetcher = vi.fn<typeof fetch>(answer);
  const app = await setup(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new ComfyRouter(fetcher),
  );
  const uploaded = await fetch(`${app.base}/api/uploads?filename=up.mp4`, {
    method: "POST",
    headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
    body: new Uint8Array(await readFile(fixture)),
  });
  const { source } = await uploaded.json();
  const request = {
    ...input,
    generator: "upscale",
    sourceId: source.id,
    upscalePrompt: "Fine linen.",
  };
  return { ...app, fetcher, request };
}

describe("local upscale through Comfy Router", () => {
  it("quotes, reserves and sends the upscale to Router, never to BFL", async () => {
    const { base, cookie, post, bfl, store, fetcher, request } =
      await upscaleSetup(async () =>
        Response.json(
          { request_id: "req_up", status: "IN_QUEUE", status_url: statusUrl },
          { status: 201 },
        ),
      );
    const quoted = await fetch(`${base}/api/quotes`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json", ...comfyKey },
      body: JSON.stringify(request),
    });
    expect(quoted.status).toBe(201);
    const { quote } = await quoted.json();
    // Router documents no credit rate for it: BFL's price, as an estimate.
    expect(quote.recipe).toMatchObject({
      id: "flux-video-upscale",
      route: "router",
    });
    expect(quote.estimateUsd).toBeGreaterThan(0);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await post("router-upscale", request, {
      ...comfyKey,
      "Quote-Id": quote.id,
    });
    expect(response.status).toBe(202);
    const { job } = await response.json();
    expect(job).toMatchObject({
      status: "Pending",
      costEstimateUsd: quote.estimateUsd,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://api.comfy.org/v2/models/bfl/video-upscale-v1/requests",
    );
    expect(init?.headers).toMatchObject({
      "X-API-Key": comfyKey["x-byo-key"],
      "Idempotency-Key": "router-upscale",
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      input_video: (await readFile(fixture)).toString("base64"),
      upscale_factor: 2,
      creativity: 0,
      prompt: "Fine linen.",
      safety_tolerance: 2,
    });
    expect(bfl.submissions).toBe(0);
    // Reserved before it was sent, and polled through the Comfy slot.
    expect(store.data.jobs[0]).toMatchObject({
      pollingUrl: statusUrl,
      take: { recipe: { route: "router" } },
    });
    // The same request id replays the run; nothing is sent again.
    expect((await post("router-upscale", request, comfyKey)).status).toBe(202);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("records an uncertain Router submission as an error and never resends it", async () => {
    const { post, store, fetcher, request } = await upscaleSetup(
      async () => new Response("down", { status: 503 }),
    );
    const response = await post("uncertain-upscale", request, comfyKey);
    // An Error run answers 200: nothing is pending.
    expect(response.status).toBe(200);
    const { job } = await response.json();
    expect(job.status).toBe("Error");
    expect(job.error).toMatch(/could not be confirmed/);
    // Not a known zero: the run may have been charged.
    expect(store.data.jobs[0].costActualUsd).toBeUndefined();
    const replay = await post("uncertain-upscale", request, comfyKey);
    expect((await replay.json()).job.id).toBe(job.id);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
