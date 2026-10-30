import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { h3RouterBody, h3RouterCredits } from "../shared/comfy/h3-router";
import { CREDITS_PER_USD } from "../shared/comfy/ltx";
import { ComfyRouter } from "../shared/comfy/router";
import { needsSourceMedia } from "../shared/h3";
import { h3OmniFixed } from "../shared/h3-hint";
import { requiredKeyKind, requireRoute } from "../shared/provider";
import { estimateRunUsd } from "../shared/quote";
import { entryFor, entriesFor, entryLabel } from "../shared/registry";
import { validateInput } from "../server/validation";

// MiniMax H3 on Comfy Router: the body, its bounds, the price and the result,
// all against fakes. Nothing here reaches Router.
const key = "comfyui-fixture-private-key";
const statusUrl =
  "https://api.comfy.org/v2/models/minimax/minimax-h3/requests/req_h3/status";
const ref = async () =>
  `data:image/png;base64,${(
    await readFile("tests/fixtures/reference.png")
  ).toString("base64")}`;
const request = (refs: string[], extra: object = {}) => ({
  generator: "video",
  model: "minimax-h3-router",
  description: "Use the first image as the character sheet.",
  cameraEnabled: false,
  draft: false,
  duration: 10,
  resolution: "hd",
  aspectRatio: "16:9",
  upscaleFactor: 2,
  imageReferences: refs,
  ...extra,
});

describe("H3 on Router: the entry", () => {
  it("is a ready Router entry, first in the H3 family, before the OmniRef four", () => {
    const entry = entryFor("video", "minimax-h3-router");
    expect(entry).toMatchObject({
      id: "minimax-h3-router",
      family: "h3",
      route: "router",
      model: "minimax/minimax-h3",
      camera: "minimax-h3",
    });
    // The wider entry leads, so the menu offers 4-15 s and other shapes first.
    expect(entriesFor("h3").map((e) => e.id)).toEqual([
      "minimax-h3-router",
      "minimax-h3",
      "minimax-h3-canny",
      "minimax-h3-depth",
      "minimax-h3-combined",
      "openjutsu-swap",
      // Music 3 sits under H3 until music has a section of its own.
      "minimax-music-3",
    ]);
    expect(entriesFor("h3").map(entryLabel)).toEqual([
      "MiniMax H3 · Reference to video · 4–15 s",
      "MiniMax H3 · Omni RGB · 5 s",
      "MiniMax H3 · Omni Canny · 5 s",
      "MiniMax H3 · Omni Depth · 5 s",
      "MiniMax H3 · Omni Combined · 5 s",
      "Openjutsu · Character swap",
      "MiniMax Music 3 · Text to music",
    ]);
    expect(entry.controls).toMatchObject({
      duration: { min: 4, max: 15 },
      resolutions: ["hd", "fhd"],
      aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    });
    // A prompt alone cannot supply the two images: no Arena run.
    expect(needsSourceMedia("minimax-h3-router")).toBe(true);
  });
  it("leaves the OmniRef four on their one proven recipe", () => {
    // 124 frames at 24 fps, 1344 x 768; nothing longer has been measured.
    // The four OmniRef rows sit between the Router row and Openjutsu's swap.
    for (const entry of entriesFor("h3").slice(1, 5))
      expect(entry.status === "ready" && entry.controls).toMatchObject({
        duration: { choices: [5] },
        aspectRatios: ["16:9"],
        resolutions: ["hd"],
      });
  });
  it("names the Router row in the OmniRef hint from the registry", () => {
    expect(h3OmniFixed()).toContain(
      `choose ${entryLabel(entryFor("video", "minimax-h3-router"))}.`,
    );
    expect(h3OmniFixed()).toContain("MiniMax H3 · Reference to video · 4–15 s");
  });
  it("needs a Comfy key", () => {
    expect(requiredKeyKind("minimax-h3-router")).toBe("comfy");
    expect(() =>
      requireRoute("video", "minimax-h3-router", "bfl-key"),
    ).toThrowError(/Comfy Router/);
    expect(() => requireRoute("video", "minimax-h3-router", key)).not.toThrow();
  });
});

describe("H3 on Router: the body", () => {
  it("sends one text item and the two references in order, with duration, resolution and ratio", () => {
    const sheet = "data:image/png;base64,AAAA";
    const board = "data:image/jpeg;base64,BBBB";
    const input = {
      duration: 10,
      aspectRatio: "16:9" as const,
      resolution: "hd" as const,
      imageReferences: [sheet, board],
    };
    expect(h3RouterBody(input, "Follow panel 1.")).toEqual({
      content: [
        { type: "text", text: "Follow panel 1." },
        {
          type: "image_url",
          image_url: { url: sheet },
          role: "reference_image",
        },
        {
          type: "image_url",
          image_url: { url: board },
          role: "reference_image",
        },
      ],
      duration: 10,
      resolution: "768P",
      ratio: "16:9",
    });
    expect(
      h3RouterBody(
        { ...input, resolution: "fhd", aspectRatio: "9:16", duration: 15 },
        "p",
      ),
    ).toMatchObject({ resolution: "2K", ratio: "9:16", duration: 15 });
    expect(h3RouterBody({ ...input, duration: 4 }, "p").duration).toBe(4);
  });
  it("refuses what the schema refuses instead of mapping it", () => {
    const input = {
      duration: 10,
      aspectRatio: "16:9" as const,
      resolution: "hd" as const,
      imageReferences: [
        "data:image/png;base64,AAAA",
        "data:image/png;base64,B",
      ],
    };
    for (const bad of [
      { duration: 3 },
      { duration: 16 },
      { duration: 7.5 },
      { aspectRatio: "2:1" as const },
      { resolution: "qhd" as const },
      { imageReferences: ["data:image/png;base64,AAAA"] },
      { imageReferences: ["0".repeat(64), "1".repeat(64)] },
    ])
      expect(() => h3RouterBody({ ...input, ...bad }, "p")).toThrow();
    expect(() => h3RouterBody(input, "  ")).toThrow();
  });
});

describe("H3 on Router: validation", () => {
  it("takes two PNG references, no camera and no guide video", async () => {
    const image = await ref();
    expect(validateInput(request([image, image]))).toMatchObject({
      model: "minimax-h3-router",
      duration: 10,
      resolution: "hd",
      imageReferences: [image, image],
      sourceId: undefined,
    });
  });
  it("rejects anything but two images, and seconds outside 4 to 15", async () => {
    const image = await ref();
    for (const refs of [[], [image], [image, image, image]])
      expect(() => validateInput(request(refs))).toThrowError(
        /character sheet first, the storyboard second/,
      );
    expect(() =>
      validateInput(request([image, "data:image/png;base64,AAAA"])),
    ).toThrow();
    for (const duration of [3, 16])
      expect(() =>
        validateInput(request([image, image], { duration })),
      ).toThrowError(/between 4 and 15/);
  });
  it("fits a ratio or tier the schema lacks, as the composer does", async () => {
    const image = await ref();
    expect(
      validateInput(
        request([image, image], { aspectRatio: "2:1", resolution: "uhd" }),
      ),
    ).toMatchObject({ aspectRatio: "21:9", resolution: "hd" });
  });
});

describe("H3 on Router: price", () => {
  it("quotes Comfy's published H3 rate per second at 768P and 2K", async () => {
    expect(h3RouterCredits(10, "hd")).toBe(271.6);
    expect(h3RouterCredits(4, "fhd")).toBe(156.88);
    // The quote both adapters reserve reads the same rate.
    const image = await ref();
    const input = validateInput(request([image, image], { resolution: "fhd" }));
    expect(estimateRunUsd(input)).toBeCloseTo(392.2 / CREDITS_PER_USD, 9);
  });
});

describe("H3 on Router: Comfy Router", () => {
  it("posts to minimax/minimax-h3 on the queued route, once", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { request_id: "req_h3", status: "IN_QUEUE", status_url: statusUrl },
          { status: 201 },
        ),
      );
    expect(
      await new ComfyRouter(fetcher).submit("video", {}, key, {
        model: "minimax-h3-router",
        idempotencyKey: "idem-h3",
      }),
    ).toEqual({ id: "req_h3", polling_url: statusUrl });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.comfy.org/v2/models/minimax/minimax-h3/requests",
    );
  });
  it("reads the MP4 at task.content.url and the credits header once the task succeeded", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task: {
              id: "t1",
              status: "succeeded",
              content: { url: "https://media.comfy.org/h3.mp4?sig=1" },
              usage: { output_seconds: 10 },
            },
          }),
          { headers: { "X-Comfy-Credits-Used": "271.6" } },
        ),
      );
    expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toEqual({
      id: "req_h3",
      status: "Ready",
      result: { sample: "https://media.comfy.org/h3.mp4?sig=1" },
      credits: 271.6,
    });
    expect(String(fetcher.mock.calls[1][0])).toBe(
      "https://api.comfy.org/v2/models/minimax/minimax-h3/requests/req_h3",
    );
  });
  it("turns a failed, cancelled or erroring task into Error, keeping its credits", async () => {
    for (const task of [
      { status: "failed", error: { code: 1, message: "x" } },
      { status: "cancelled" },
      { status: "expired" },
      {
        status: "succeeded",
        content: { url: "https://media.comfy.org/h3.mp4" },
        error: { code: 2 },
      },
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ task }), {
            headers: { "X-Comfy-Credits-Used": "0" },
          }),
        );
      expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toEqual({
        id: "req_h3",
        status: "Error",
        credits: 0,
      });
    }
  });
  it("reads a result link past its window as expired, never as a retry", async () => {
    for (const status of [403, 404, 410]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("gone", { status }));
      await expect(
        new ComfyRouter(fetcher).download("https://media.comfy.org/h3.mp4"),
      ).rejects.toMatchObject({ code: "delivery_expired" });
    }
    const flaky = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(
      new ComfyRouter(flaky).download("https://media.comfy.org/h3.mp4"),
    ).rejects.not.toMatchObject({ code: "delivery_expired" });
  });
});
