import { describe, expect, it, vi } from "vitest";
import {
  ComfyRouter,
  creditsUsed,
  routerStatusUrl,
} from "../shared/comfy/router";
import { isComfyKey, mediaUrl } from "../shared/provider";

const key = "comfyui-fixture-private-key";
const statusUrl =
  "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1/status";

describe("Comfy Router submit", () => {
  it("posts the queued route with the key in a header and the idempotency key, never in the URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { request_id: "req_1", status: "IN_QUEUE", status_url: statusUrl },
          { status: 201 },
        ),
      );
    const result = await new ComfyRouter(fetcher).submit(
      "video",
      { prompt: "A log cabin.", duration: 5, resolution: "1280x720" },
      key,
      { model: "ltx-2.5", idempotencyKey: "idem-1" },
    );
    expect(result).toEqual({ id: "req_1", polling_url: statusUrl });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests",
    );
    expect(String(url)).not.toContain(key);
    expect(init).toMatchObject({
      method: "POST",
      redirect: "manual",
      headers: { "X-API-Key": key, "Idempotency-Key": "idem-1" },
    });
  });
  it("routes FLUX 3 to the BFL partner", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          request_id: "req_2",
          status_url:
            "https://api.comfy.org/v2/models/bfl/flux-3-video/requests/req_2/status",
        },
        { status: 201 },
      ),
    );
    await new ComfyRouter(fetcher).submit("video", {}, key, {
      model: "flux-3",
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.comfy.org/v2/models/bfl/flux-3-video/requests",
    );
  });
  it("treats a 5xx or a network failure as an unconfirmed submission, never retried", async () => {
    for (const fetcher of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("down", { status: 503 })),
      vi.fn<typeof fetch>().mockRejectedValue(new Error(key)),
    ]) {
      await expect(
        new ComfyRouter(fetcher).submit("video", {}, key, { model: "ltx-2.5" }),
      ).rejects.toMatchObject({ code: "submission_unknown" });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("maps Comfy error types to plain messages without exposing bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: key }), {
        status: 402,
        headers: { "X-Comfy-Error-Type": "insufficient_credits" },
      }),
    );
    await expect(
      new ComfyRouter(fetcher).submit("video", {}, key, { model: "ltx-2.5" }),
    ).rejects.toThrow("not have enough credits");
  });
});

describe("Comfy Router poll", () => {
  it("reads queue and progress states from the status URL", async () => {
    for (const [state, status] of [
      ["IN_QUEUE", "Pending"],
      ["IN_PROGRESS", "Generating"],
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ request_id: "req_1", status: state }),
        );
      expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toEqual({
        id: "req_1",
        status,
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("collects the native LTX result, its video URL and the credits header once completed", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "ltx-job",
            status: "completed",
            result: { video_url: "https://cdn.example.com/clip.mp4?sig=1" },
          }),
          { headers: { "X-Comfy-Credits-Used": "135.8" } },
        ),
      );
    expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toEqual({
      id: "req_1",
      status: "Ready",
      result: { sample: "https://cdn.example.com/clip.mp4?sig=1" },
      credits: 135.8,
    });
    expect(String(fetcher.mock.calls[1][0])).toBe(
      "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1",
    );
  });
  it("collects the native FLUX sample and reports no credits when the header is absent", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        Response.json({
          id: "bfl-task",
          status: "Ready",
          result: { sample: "https://delivery.bfl.ai/clip.mp4" },
        }),
      );
    expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toMatchObject({
      status: "Ready",
      result: { sample: "https://delivery.bfl.ai/clip.mp4" },
      credits: null,
    });
  });
  it("turns 202, 410 and error types into the job vocabulary", async () => {
    const cases: [Response[], string][] = [
      [
        [
          Response.json({ status: "COMPLETED" }),
          new Response(null, { status: 202 }),
        ],
        "Generating",
      ],
      [
        [
          Response.json({ status: "COMPLETED" }),
          new Response(null, { status: 410 }),
        ],
        "Task not found",
      ],
      [
        [
          Response.json({
            status: "COMPLETED",
            error_type: "content_policy_violation",
          }),
        ],
        "Content Moderated",
      ],
      [
        [Response.json({ status: "COMPLETED", error_type: "provider_error" })],
        "Error",
      ],
    ];
    for (const [responses, status] of cases) {
      const fetcher = vi.fn<typeof fetch>();
      for (const r of responses) fetcher.mockResolvedValueOnce(r);
      expect((await new ComfyRouter(fetcher).poll(statusUrl, key)).status).toBe(
        status,
      );
    }
  });
  it("refuses a polling URL that is not a Router status URL", () => {
    for (const bad of [
      "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1",
      "https://evil.example/v2/models/ltx/ltx-2-5-fast/requests/req_1/status",
      "http://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1/status",
      "https://user:pw@api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1/status",
    ])
      expect(() => routerStatusUrl(bad)).toThrow("delivery location");
  });
});

describe("Comfy balance and media", () => {
  it("verifies the key against the model catalogue and reports a balance only when Cloud answers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "ltx-2-5-fast" }))
      .mockResolvedValueOnce(
        Response.json({
          amount_cents: 2088.24,
          amount_micros: 2088.24,
          currency: "usd",
        }),
      );
    const balance = await new ComfyRouter(fetcher).balance(key);
    expect(balance.usdCents).toBe(2088.24);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast",
    );
  });
  it.each([
    [{ amount_micros: 2088.24, currency: "usd" }, 2088.24],
    [{ amount_cents: 0.25, amount_micros: 500, currency: "USD" }, 0.25],
    [{ amount_cents: 0, amount_micros: 500, currency: "usd" }, 0],
    [
      { amount_cents: 500, effective_balance_cents: 12.5, currency: "usd" },
      12.5,
    ],
    [{ amount_cents: 500, effective_balance_micros: 0, currency: "usd" }, 0],
    [{ amount_cents: 500, effective_balance_cents: -20, currency: "usd" }, -20],
    [
      {
        effective_balance_cents: 1,
        effective_balance_micros: 2,
        currency: "usd",
      },
      1,
    ],
    [{ amount_cents: 10, currency: "eur" }, null],
    [{ amount_cents: 10 }, null],
    [{ amount_cents: "10", amount_micros: 10, currency: "usd" }, null],
    [{ amount_cents: -10, currency: "usd" }, null],
    [
      { amount_cents: 500, effective_balance_cents: null, currency: "usd" },
      null,
    ],
    [{ currency: "usd" }, null],
    [null, null],
    [[], null],
  ])(
    "reads documented balance units without inventing a USD balance: %j",
    async (data, expected) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ id: "ltx-2-5-fast" }))
        .mockResolvedValueOnce(Response.json(data));
      expect((await new ComfyRouter(fetcher).balance(key)).usdCents).toBe(
        expected,
      );
    },
  );
  it("keeps a verified key when the balance route refuses, and rejects a bad key", async () => {
    const verifiedOnly = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "ltx-2-5-fast" }))
      .mockResolvedValueOnce(new Response("no", { status: 403 }));
    expect(
      (await new ComfyRouter(verifiedOnly).balance(key)).usdCents,
    ).toBeNull();
    const bad = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(key, { status: 401 }));
    await expect(new ComfyRouter(bad).balance(key)).rejects.toThrow(
      "The API key was not accepted.",
    );
  });
  it("reads the credits header strictly", () => {
    expect(
      creditsUsed(
        new Response(null, { headers: { "X-Comfy-Credits-Used": "12.5" } }),
      ),
    ).toBe(12.5);
    expect(
      creditsUsed(
        new Response(null, { headers: { "X-Comfy-Credits-Used": "-1" } }),
      ),
    ).toBeNull();
    expect(creditsUsed(new Response(null))).toBeNull();
  });
  it("accepts public https media only", () => {
    expect(mediaUrl("https://cdn.example.com/a.mp4").hostname).toBe(
      "cdn.example.com",
    );
    for (const bad of [
      "http://cdn.example.com/a.mp4",
      "https://127.0.0.1/a.mp4",
      "https://localhost/a.mp4",
      "https://cdn.example.com:8443/a.mp4",
      "https://u:p@cdn.example.com/a.mp4",
      "https://media/a.mp4",
    ])
      expect(() => mediaUrl(bad)).toThrow();
  });
  it("tells Comfy keys from BFL keys by the documented prefix", () => {
    expect(isComfyKey("comfyui-abc")).toBe(true);
    expect(isComfyKey("bfl-abc")).toBe(false);
  });
});
