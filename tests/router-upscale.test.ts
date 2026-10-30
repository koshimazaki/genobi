import { describe, expect, it, vi } from "vitest";
import { ComfyRouter, UPSCALE_ROUTE } from "../shared/comfy/router";
import { chooseKey, requireRoute } from "../shared/provider";
import { entryFor } from "../shared/registry";
import { startTake } from "../shared/take";
import { upscaleBody } from "../shared/upscale";
import type { GenerateInput } from "../shared/types";

// FLUX Video Upscale through Comfy Router (bfl/video-upscale-v1): the body
// both adapters send, the route, the key choice and the result, on fakes only.
const COMFY = "comfyui-upscale-fixture-key";
const BFL = "bfl-upscale-fixture-key";
const statusUrl = `https://api.comfy.org/v2/models/${UPSCALE_ROUTE}/requests/req_up/status`;
const settings = { upscaleFactor: 2, upscaleCreativity: 0 as const };

describe("the upscale body", () => {
  it("sends Router's schema fields only, with no user tag on a Comfy key", () => {
    expect(
      upscaleBody(settings, "Fine linen.", "AAAA", COMFY, "session-1"),
    ).toEqual({
      input_video: "AAAA",
      upscale_factor: 2,
      creativity: 0,
      prompt: "Fine linen.",
      safety_tolerance: 2,
    });
  });
  it("keeps BFL direct's user tag and omits an empty prompt", () => {
    expect(
      upscaleBody(
        { upscaleFactor: 3, upscaleCreativity: 1 },
        "",
        "https://studio.test/api/input/t",
        BFL,
        "session-1",
      ),
    ).toEqual({
      input_video: "https://studio.test/api/input/t",
      upscale_factor: 3,
      creativity: 1,
      safety_tolerance: 2,
      user: "session-1",
    });
  });
  it("refuses a factor, creativity or source outside the schema", () => {
    for (const factor of [1.4, 3.1, Number.NaN])
      expect(() =>
        upscaleBody(
          { ...settings, upscaleFactor: factor },
          "",
          "A",
          COMFY,
          "s",
        ),
      ).toThrow("between 1.5× and 3×");
    expect(() =>
      upscaleBody(
        { ...settings, upscaleCreativity: 2 as 0 },
        "",
        "A",
        COMFY,
        "s",
      ),
    ).toThrow("Precise or Creative");
    expect(() => upscaleBody(settings, "", "", COMFY, "s")).toThrow(
      "Choose a video",
    );
  });
});

describe("which key runs an upscale", () => {
  it("runs on either key, and on the BFL key when both are held", () => {
    expect(() => requireRoute("upscale", "flux-3", COMFY)).not.toThrow();
    expect(() => requireRoute("upscale", "flux-3", BFL)).not.toThrow();
    expect(chooseKey("upscale", "flux-3", { comfy: COMFY, bfl: BFL })).toBe(
      BFL,
    );
    expect(chooseKey("upscale", "flux-3", { bfl: BFL })).toBe(BFL);
    expect(chooseKey("upscale", "flux-3", {})).toBeUndefined();
  });
  it("records Router on a Comfy key and BFL direct on a BFL key", async () => {
    const input = {
      generator: "upscale",
      model: "flux-3",
      description: "",
      sourceId: "clip-1",
      ...settings,
    } as GenerateInput;
    expect(entryFor("upscale", "flux-3")).toMatchObject({
      route: "router",
      model: UPSCALE_ROUTE,
    });
    expect((await startTake(input, true)).recipe.route).toBe("router");
    expect((await startTake(input, false)).recipe.route).toBe("bfl");
  });
});

describe("Comfy Router upscale", () => {
  it("posts the queued upscale route with the key and idempotency key in headers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { request_id: "req_up", status: "IN_QUEUE", status_url: statusUrl },
          { status: 201 },
        ),
      );
    const body = upscaleBody(settings, "", "AAAA", COMFY, "s");
    expect(
      await new ComfyRouter(fetcher).submit("upscale", body, COMFY, {
        model: "flux-3",
        idempotencyKey: "idem-up",
      }),
    ).toEqual({ id: "req_up", polling_url: statusUrl });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://api.comfy.org/v2/models/bfl/video-upscale-v1/requests",
    );
    expect(init).toMatchObject({
      method: "POST",
      redirect: "manual",
      headers: { "X-API-Key": COMFY, "Idempotency-Key": "idem-up" },
    });
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });
  it("refuses an upscale that does not carry FLUX 3, before sending", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new ComfyRouter(fetcher).submit("upscale", {}, COMFY, {
        model: "ltx-2.5",
      }),
    ).rejects.toMatchObject({ status: 400, code: "unsupported_model" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never retries an uncertain upscale submission", async () => {
    for (const fetcher of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("down", { status: 502 })),
      vi.fn<typeof fetch>().mockRejectedValue(new Error("reset")),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ status: "IN_QUEUE" })),
    ]) {
      await expect(
        new ComfyRouter(fetcher).submit("upscale", {}, COMFY, {
          model: "flux-3",
        }),
      ).rejects.toMatchObject({ code: "submission_unknown" });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("says a refused oversized body is too large, as a provider answer", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("too large", { status: 413 }));
    await expect(
      new ComfyRouter(fetcher).submit("upscale", {}, COMFY, {
        model: "flux-3",
      }),
    ).rejects.toMatchObject({
      code: "provider_413",
      message: "This source video is too large to send to Comfy.",
    });
  });
  it("collects BFL's result document with Comfy's sample URL and the credits header", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "bfl-task",
            status: "Ready",
            // BFL's own figure, not the Comfy charge: never read as one.
            result: {
              sample: "https://storage.comfy.org/up.mp4?sig=1",
              cost: 99,
            },
          }),
          { headers: { "X-Comfy-Credits-Used": "208.9" } },
        ),
      );
    expect(await new ComfyRouter(fetcher).poll(statusUrl, COMFY)).toEqual({
      id: "req_up",
      status: "Ready",
      result: { sample: "https://storage.comfy.org/up.mp4?sig=1" },
      credits: 208.9,
    });
    expect(String(fetcher.mock.calls[1][0])).toBe(
      "https://api.comfy.org/v2/models/bfl/video-upscale-v1/requests/req_up",
    );
  });
});
