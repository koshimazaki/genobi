import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasFfmpeg } from "./ffmpeg-harness";
import { input, setup } from "./server-harness";

// The split upscale over HTTP with real ffmpeg: a 23.125 s, 24 fps clip with
// sound, cut at 19 s, "upscaled" by a fake BFL that hands back a silent clip at twice
// the size, then joined. Skipped where ffmpeg is not installed.
const work: string[] = [];
afterEach(async () => {
  for (const folder of work.splice(0))
    await rm(folder, { recursive: true, force: true });
});

async function render(args: string[]) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-parts-"));
  work.push(folder);
  const file = path.join(folder, "clip.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args, file]);
  return new Uint8Array(await readFile(file));
}

const streams = (file: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,width,height,nb_read_frames,duration",
      "-of",
      "json",
      file,
    ]).toString(),
  ).streams as {
    codec_type: string;
    width?: number;
    nb_read_frames?: string;
    duration: string;
  }[];

describe("a split upscale with real ffmpeg", () => {
  it.skipIf(!hasFfmpeg)(
    "cuts on frames and joins at the source's frame count with its own sound",
    async () => {
      const app = await setup();
      const json = (method: string, url: string, body?: object, extra = {}) =>
        fetch(`${app.base}${url}`, {
          method,
          headers: {
            cookie: app.cookie,
            "Content-Type": "application/json",
            ...extra,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      const source = await render([
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=160x90:rate=24:duration=23.125",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=23.125",
        "-shortest",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
      ]);
      const uploaded = await fetch(`${app.base}/api/uploads?filename=mix.mp4`, {
        method: "POST",
        headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
        body: source,
      });
      // Longer than one upscale, accepted locally because it can be split.
      expect(uploaded.status).toBe(201);
      const { source: long } = await uploaded.json();
      const request = { ...input, generator: "upscale", sourceId: long.id };
      // One upscale still refuses it, pointing at the split.
      const single = await json("POST", "/api/quotes", request);
      expect((await single.json()).code).toBe("upscale_too_long");

      const planned = await json("POST", "/api/upscale-parts", request);
      expect(planned.status).toBe(201);
      const { set } = await planned.json();
      expect(set.plan.parts.map((p: { frames: number }) => p.frames)).toEqual([
        456, 99,
      ]);
      const cut = app.store.data.sources.find(
        (s) => s.id === set.parts[1].sourceId,
      )!;
      expect(Number(streams(cut.filePath)[0].nb_read_frames)).toBe(99);
      // The 4.125 s tail is quoted like any part: no whole-second rule.
      expect(cut.duration).toBeCloseTo(4.125, 2);
      const stored = app.store.data.partSets[0];
      const tail = app.store.data.quotes.find(
        (q) => q.id === stored.parts[1].quoteId,
      )!;
      expect(tail.estimateUsd).toBeGreaterThan(0);
      expect(app.bfl.submissions).toBe(0);

      const confirmed = await json(
        "POST",
        `/api/upscale-parts/${set.id}/confirm`,
        undefined,
        { "Quote-Id": set.quoteId },
      );
      expect(confirmed.status).toBe(202);
      expect(app.bfl.submissions).toBe(2);
      // The upscaler hands back a silent clip at twice the size, a frame short.
      app.bfl.media = await render([
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x180:rate=24",
        "-frames:v",
        "276",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
      ]);
      app.bfl.ready = true;
      for (const job of app.store.data.jobs) job.lastPolledAt = 0;
      const read = await (
        await json("GET", `/api/upscale-parts/${set.id}`)
      ).json();
      expect(read.set.status).toBe("joined");
      expect(read.set.joined.width).toBe(320);
      const joined = app.store.data.sources.find(
        (s) => s.id === read.set.joined.id,
      )!;
      expect(joined.operation).toBe("concat");
      expect(joined.derivedFrom).toEqual([
        ...read.set.parts.map((p: { job: { id: string } }) => p.job.id),
        long.id,
      ]);
      const out = streams(joined.filePath);
      const video = out.find((s) => s.codec_type === "video")!;
      const audio = out.find((s) => s.codec_type === "audio");
      expect(Number(video.nb_read_frames)).toBe(555);
      expect(audio).toBeDefined();
      expect(Number(audio!.duration)).toBeCloseTo(23.125, 1);
      expect(app.bfl.submissions).toBe(2);
    },
    60_000,
  );
});
