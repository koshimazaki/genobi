import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { wav } from "./audio-fixtures";
import { cleanups, hasFfmpeg, setup, clip } from "./ffmpeg-harness";

// Real ffmpeg renders, skipped where ffmpeg or ffprobe is not installed.
describe("the local media service with real ffmpeg", () => {
  it.skipIf(!hasFfmpeg)(
    "cuts odd-sized video and crossfades clips whose sound outlasts the picture",
    async () => {
      const { upload, media, store } = await setup();
      const work = await mkdtemp(path.join(os.tmpdir(), "genobi-render-"));
      cleanups.push(() => rm(work, { recursive: true, force: true }));
      const render = async (name: string, args: string[]) => {
        const file = path.join(work, name);
        execFileSync("ffmpeg", [
          "-hide_banner",
          "-v",
          "error",
          "-y",
          ...args,
          "-f",
          "mp4",
          file,
        ]);
        return new Uint8Array(await readFile(file));
      };
      const streams = (id: string) =>
        Object.fromEntries(
          execFileSync("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,duration",
            "-of",
            "csv=p=0",
            store.data.sources.find((item) => item.id === id)!.filePath,
          ])
            .toString()
            .trim()
            .split("\n")
            .map((line) => {
              const [type, duration] = line.split(",");
              return [type, Number(duration)];
            }),
        );
      // yuv444p lets the source keep odd sides; the cut must still encode.
      const odd = await upload(
        await render("odd.mp4", [
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=321x241:rate=24:duration=2",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv444p",
        ]),
        "video/mp4",
        "odd.mp4",
      );
      const cut = await media("trim", {
        sourceId: odd.id,
        start: 0,
        duration: 1,
      });
      expect(cut.status).toBe(201);
      expect((await cut.json()).source).toMatchObject({
        width: 320,
        height: 240,
      });
      // Two seconds of picture, three of sound: the reader says three.
      const uneven = await upload(
        await render("uneven.mp4", [
          "-f",
          "lavfi",
          "-i",
          "testsrc=size=320x240:rate=24:duration=2",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=48000:duration=3",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
        ]),
        "video/mp4",
        "uneven.mp4",
      );
      expect(uneven.duration).toBeCloseTo(3, 1);
      const faded = await media("crossfade", {
        sourceIds: [uneven.id, uneven.id],
        duration: 0.5,
      });
      expect(faded.status).toBe(201);
      const { source } = await faded.json();
      expect(source.duration).toBeCloseTo(5.5, 1);
      const lengths = streams(source.id);
      expect(lengths.video).toBeCloseTo(5.5, 1);
      expect(lengths.audio).toBeCloseTo(5.5, 1);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "cuts, frames, joins and crossfades real video",
    async () => {
      const { upload, media } = await setup();
      const video = await upload(await clip(), "video/mp4", "clip.mp4");
      const cut = (
        await (
          await media("trim", { sourceId: video.id, start: 1, duration: 2 })
        ).json()
      ).source;
      expect(cut.duration).toBeCloseTo(2, 1);
      const frames = (
        await (
          await media("frames", { sourceId: video.id, times: [1, 5] })
        ).json()
      ).sources;
      expect(
        frames.map((f: { width: number; mediaType: string }) => [
          f.mediaType,
          f.width,
        ]),
      ).toEqual([
        ["image", 960],
        ["image", 960],
      ]);
      const joined = (
        await (await media("concat", { sourceIds: [cut.id, cut.id] })).json()
      ).source;
      expect(joined.duration).toBeCloseTo(4, 1);
      const faded = (
        await (
          await media("crossfade", {
            sourceIds: [cut.id, cut.id],
            duration: 0.5,
          })
        ).json()
      ).source;
      expect(faded.duration).toBeCloseTo(3.5, 1);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "joins and crossfades real audio",
    async () => {
      const { upload, media } = await setup();
      const one = await upload(wav(1), "audio/wav", "one.wav");
      const two = await upload(wav(2), "audio/wav", "two.wav");
      const track = (
        await (await media("concat", { sourceIds: [one.id, two.id] })).json()
      ).source;
      expect(track).toMatchObject({
        mediaType: "audio",
        contentType: "audio/wav",
      });
      expect(track.duration).toBeCloseTo(3, 2);
      const blend = (
        await (
          await media("crossfade", {
            sourceIds: [two.id, two.id],
            duration: 0.5,
          })
        ).json()
      ).source;
      expect(blend.duration).toBeCloseTo(3.5, 2);
    },
    60_000,
  );
});
