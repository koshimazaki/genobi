import { afterEach, expect, it, vi } from "vitest";
import { activityNow } from "../src/busy";
import {
  fetchMediaFiles,
  mediaLoadLine,
  mediaLoadNow,
  mediaLoadStatus,
  parseActivityLine,
} from "../src/director/media-progress";

const MB = 1024 * 1024;

afterEach(() => vi.unstubAllGlobals());

/** A response whose body arrives in `chunks`, waiting on `gate` before each. */
function streamed(
  chunks: Uint8Array[],
  length: boolean,
  gate?: () => Promise<void>,
) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await gate?.();
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
  const size = chunks.reduce((n, c) => n + c.byteLength, 0);
  return new Response(body, {
    headers: length ? { "Content-Length": String(size) } : {},
  });
}

it("counts streamed bytes against the Content-Length total and returns them in order", async () => {
  const lines: string[] = [];
  const statuses: string[] = [];
  // Sample what the studio shows before each chunk lands.
  const gate = async () => {
    const media = activityNow().find((a) => a.id.startsWith("template-media"));
    if (media) lines.push(media.line);
    const load = mediaLoadNow();
    if (load) statuses.push(mediaLoadStatus(load));
  };
  const a = new Uint8Array(3 * MB).fill(1);
  const b = new Uint8Array(1 * MB).fill(2);
  vi.stubGlobal("fetch", async (url: string) =>
    url === "/a.mp4"
      ? streamed([a.subarray(0, MB), a.subarray(MB)], true, gate)
      : streamed([b], true, gate),
  );
  const [first, second] = await fetchMediaFiles("Acoustic Spaces v2", [
    "/a.mp4",
    "/b.flac",
  ]);
  // Byte for byte, without a deep-equal walk over four million elements.
  expect(Buffer.from(first).equals(Buffer.from(a))).toBe(true);
  expect(Buffer.from(second).equals(Buffer.from(b))).toBe(true);
  expect(
    lines.some((l) => /^LOADING ACOUSTIC SPACES V2 {2}\d+% /.test(l)),
  ).toBe(true);
  expect(lines.some((l) => l.endsWith(" / 4 MB"))).toBe(true);
  expect(statuses.some((s) => /^Loading 2 files · \d of 4 MB$/.test(s))).toBe(
    true,
  );
  // Done: nothing is left beside the wordmark or on the stage.
  expect(activityNow().some((a) => a.id.startsWith("template-media"))).toBe(
    false,
  );
  expect(mediaLoadNow()).toBeUndefined();
});

it("reports an indeterminate load when a response has no Content-Length", async () => {
  let line = "";
  const gate = async () => {
    line =
      activityNow().find((a) => a.id.startsWith("template-media"))?.line ?? "";
  };
  vi.stubGlobal("fetch", async () =>
    streamed([new Uint8Array(10), new Uint8Array(5)], false, gate),
  );
  const [bytes] = await fetchMediaFiles("Dance with Fruits", ["/x.mp4"]);
  expect(bytes.byteLength).toBe(15);
  expect(line).toBe("LOADING DANCE WITH FRUITS");
  expect(parseActivityLine(line).percent).toBeUndefined();
});

it("clears the activity when a file fails", async () => {
  vi.stubGlobal("fetch", async (url: string) =>
    url === "/bad"
      ? new Response(null, { status: 503 })
      : streamed([new Uint8Array(4)], true),
  );
  await expect(fetchMediaFiles("Bloom", ["/ok", "/bad"])).rejects.toThrow(
    "Template media unavailable",
  );
  expect(activityNow().some((a) => a.id.startsWith("template-media"))).toBe(
    false,
  );
  expect(mediaLoadNow()).toBeUndefined();
});

it("draws the line with the shared bar and MB, and reads it back", () => {
  const line = mediaLoadLine({
    name: "Acoustic Spaces v2",
    files: 9,
    doneBytes: 24 * MB,
    totalBytes: 66 * MB,
  });
  expect(line).toMatch(
    /^LOADING ACOUSTIC SPACES V2 {2}36% [⣀-⣿]{4} {2}24 \/ 66 MB$/,
  );
  expect(parseActivityLine(line)).toEqual({
    label: "LOADING ACOUSTIC SPACES V2",
    percent: 36,
  });
  expect(
    mediaLoadStatus({
      name: "x",
      files: 9,
      doneBytes: 24 * MB,
      totalBytes: 66 * MB,
    }),
  ).toBe("Loading 9 files · 24 of 66 MB");
});
