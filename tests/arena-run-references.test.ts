import { expect, it, vi } from "vitest";
import { newArena, type Arena, type ArenaMedia } from "../shared/arena";
import { MAX_IMAGE_BYTES } from "../shared/image";
import { referenceUrls } from "../src/arena/run-references";

const image = (label: string, bytes = 3): ArenaMedia => ({
  hash: label,
  label,
  bytes,
  kind: "image",
  contentType: "image/png",
  width: 256,
  height: 256,
  duration: 0,
});
const arena = (media: ArenaMedia[]): Arena => ({
  ...newArena(),
  id: "a",
  revision: 1,
  updatedAt: "2026-10-26T00:00:00Z",
  media,
});

it.each([
  {
    name: "oversized",
    media: [image("Creature", MAX_IMAGE_BYTES + 1)],
    message: "Creature",
  },
  {
    name: "extra",
    media: Array.from({ length: 11 }, (_, i) => image(String(i))),
    message: "at most 10",
  },
  {
    name: "combined",
    media: [
      image("a", MAX_IMAGE_BYTES),
      image("b", MAX_IMAGE_BYTES),
      image("c", MAX_IMAGE_BYTES),
    ],
    message: "combined",
  },
])(
  "rejects $name references before loading any partial set",
  async ({ media, message }) => {
    const fetcher = vi.fn(),
      encode = vi.fn();
    await expect(referenceUrls(arena(media), fetcher, encode)).rejects.toThrow(
      message,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  },
);

it("preserves reference order and excludes result images and video guides", async () => {
  const a = arena([
    image("identity"),
    image("result"),
    { ...image("video"), kind: "video", contentType: "video/mp4" },
    image("style"),
  ]);
  a.slots[0].media = "result";
  const fetcher = vi.fn(
    async (url: RequestInfo | URL) =>
      new Response(String(url).endsWith("identity") ? "one" : "two"),
  );
  const encode = vi.fn(
    async (blob: Blob) => `data:image/png,${await blob.text()}`,
  );
  expect(await referenceUrls(a, fetcher, encode)).toEqual([
    "data:image/png,one",
    "data:image/png,two",
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("refuses a missing or truncated reference instead of continuing to paid generation", async () => {
  const encode = vi.fn();
  await expect(
    referenceUrls(
      arena([image("Creature")]),
      vi.fn(async () => new Response("Missing", { status: 404 })),
      encode,
    ),
  ).rejects.toThrow("Creature");
  await expect(
    referenceUrls(
      arena([image("Creature")]),
      vi.fn(async () => new Response("x")),
      encode,
    ),
  ).rejects.toThrow("incomplete");
  expect(encode).not.toHaveBeenCalled();
});
