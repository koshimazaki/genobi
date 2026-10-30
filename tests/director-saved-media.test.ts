import { afterEach, expect, it, vi } from "vitest";
import {
  listSavedVideos,
  loadSavedVideo,
  saveVideo,
  UploadOutcomeUnknownError,
} from "../src/director/saved-media";
import type { Source } from "../shared/types";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../shared/director/types";
const id = "11111111-1111-4111-8111-111111111111";
const source: Source = {
  id,
  label: "Comfy output",
  url: "https://untrusted.example/output.mp4",
  width: 512,
  height: 896,
  duration: 3.233333,
  origin: "upload",
};
afterEach(() => vi.unstubAllGlobals());
it("loads only the owned clip endpoint and never follows a source URL or forwards a key", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const file = await loadSavedVideo(source);
  expect(file.size).toBe(3);
  expect(fetcher).toHaveBeenCalledWith(`/api/clips/${id}`, {
    cache: "no-store",
    redirect: "error",
  });
  await expect(loadSavedVideo({ ...source, id: "../escape" })).rejects.toThrow(
    "Invalid",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("refuses expired, oversized and non-video assets", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(
      new Response("x", {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(DIRECTOR_MEDIA_BYTES + 1),
        },
      }),
    )
    .mockResolvedValueOnce(
      new Response("x", { headers: { "content-type": "image/png" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(loadSavedVideo(source)).rejects.toThrow("expired");
  await expect(loadSavedVideo(source)).rejects.toThrow(DIRECTOR_MEDIA_LIMIT);
  await expect(loadSavedVideo(source)).rejects.toThrow("MP4");
});
it("sends one upload with transient key only in its header, without retrying uncertainty", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("Connection lost"));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    saveVideo(new Blob(["video"]), "test & clip", "test-transient-key"),
  ).rejects.toBeInstanceOf(UploadOutcomeUnknownError);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("/api/uploads?filename=test+%26+clip.mp4");
  expect(options.headers).toEqual({
    "Content-Type": "video/mp4",
    "x-byo-key": "test-transient-key",
  });
  expect(options.method).toBe("POST");
});
it("lists saved videos separately from bundled samples and images", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        sources: [
          source,
          { ...source, origin: "sample" },
          { ...source, mediaType: "image" },
        ],
      }),
    ),
  );
  expect(await listSavedVideos()).toEqual([source]);
});

it("distinguishes definite upload refusals from uncertain server outcomes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Video too long" }, { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 })),
  );
  const refusal = await saveVideo(new Blob(["x"]), "clip", "").catch((e) => e);
  expect(refusal.message).toBe("Video too long");
  expect(refusal).not.toBeInstanceOf(UploadOutcomeUnknownError);
  await expect(saveVideo(new Blob(["x"]), "clip", "")).rejects.toBeInstanceOf(
    UploadOutcomeUnknownError,
  );
});
it("bounds streaming clips without a content-length header and cancels the reader", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({
    start(controller) {
      // Past the project's media limit, not the 50 MB upload limit: a saved
      // (upscaled) clip enters the project.
      controller.enqueue(new Uint8Array(DIRECTOR_MEDIA_BYTES / 2 + 1));
      controller.enqueue(new Uint8Array(DIRECTOR_MEDIA_BYTES / 2 + 1));
    },
    cancel,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(body, { headers: { "content-type": "video/mp4" } }),
      ),
  );
  await expect(loadSavedVideo(source)).rejects.toThrow(DIRECTOR_MEDIA_LIMIT);
  expect(cancel).toHaveBeenCalledOnce();
});
