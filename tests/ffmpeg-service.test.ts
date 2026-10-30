import { copyFile, open, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type Run } from "../server/ffmpeg";
import { MAX_RESULT_BYTES } from "../shared/lifecycle";
import { flac, wav } from "./audio-fixtures";
import { setup, clip } from "./ffmpeg-harness";

// The media routes with a fake in place of ffmpeg: ownership, refusals, errors
// that leak nothing, and the size ceiling.
describe("the local media service", () => {
  it("runs ffmpeg on owned sources only and saves a hashed, derived source", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const fake: Run = async (command, args) => {
      calls.push({ command, args });
      if (args[0] === "-version") return "ffmpeg version test";
      if (command === "ffprobe")
        return JSON.stringify({
          format: { duration: "2" },
          streams: [
            {
              codec_type: "video",
              width: 960,
              height: 528,
              r_frame_rate: "24/1",
            },
          ],
        });
      const out = args.at(-1)!;
      if (out.endsWith(".mp4"))
        await copyFile(path.resolve("tests/fixtures/metadata.mp4"), out);
      else if (out.endsWith(".audio")) await writeFile(out, wav(1));
      else await copyFile(path.resolve("tests/fixtures/reference.png"), out);
      return "";
    };
    const { upload, media, store, base, cookie } = await setup(fake);
    expect(
      await (
        await fetch(`${base}/api/media/tools`, { headers: { cookie } })
      ).json(),
    ).toEqual({ ffmpeg: true });
    const video = await upload(await clip(), "video/mp4", "clip.mp4");
    const trimmed = await media("trim", {
      sourceId: video.id,
      start: 1,
      duration: 2,
    });
    expect(trimmed.status).toBe(201);
    const { source } = await trimmed.json();
    expect(source).toMatchObject({
      origin: "derived",
      label: "Trim of clip.mp4",
      width: 960,
    });
    expect(source).not.toHaveProperty("sha256");
    expect(source).not.toHaveProperty("derivedFrom");
    const stored = store.data.sources.find((item) => item.id === source.id)!;
    expect(stored.derivedFrom).toEqual([video.id]);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The input is the stored file the server chose, never request text.
    const run = calls.at(-1)!;
    expect(run.command).toBe("ffmpeg");
    expect(run.args).toContain(store.data.sources[0].filePath);
    const frames = await media("frames", { sourceId: video.id, times: [0, 5] });
    expect((await frames.json()).sources).toHaveLength(2);
    // Someone else's id is missing, not borrowed.
    const stranger = `camera_session=${"2".repeat(8)}-2222-2222-2222-${"2".repeat(12)}`;
    expect(
      (
        await media(
          "trim",
          { sourceId: video.id, start: 0, duration: 1 },
          stranger,
        )
      ).status,
    ).toBe(404);
    expect((await media("transcode", {})).status).toBe(404);
  });

  it("refuses requests it cannot carry out honestly", async () => {
    const { upload, media } = await setup(async () => "ffmpeg version test");
    const video = await upload(await clip(), "video/mp4", "clip.mp4");
    const audio = await upload(wav(2), "audio/wav", "beat.wav");
    for (const [operation, body, message] of [
      ["trim", { sourceId: video.id, start: 9, duration: 2 }, /own length/],
      ["frames", { sourceId: audio.id, times: [0] }, /from a video/],
      ["concat", { sourceIds: [video.id, audio.id] }, /video with video/],
      [
        "crossfade",
        { sourceIds: [audio.id, audio.id], duration: 2 },
        /shorter than either/,
      ],
      ["concat", { sourceIds: ["../etc/passwd", video.id] }, /this session/],
    ] as const) {
      const refused = await media(operation, body);
      expect(refused.status).toBe(400);
      expect((await refused.json()).error).toMatch(message);
    }
  });

  it("says when ffmpeg is missing or fails, without leaking paths or files", async () => {
    const missing = await setup(async () => {
      throw Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    });
    const video = await missing.upload(await clip(), "video/mp4", "clip.mp4");
    const refused = await missing.media("trim", {
      sourceId: video.id,
      start: 0,
      duration: 1,
    });
    expect(refused.status).toBe(503);
    expect((await refused.json()).code).toBe("ffmpeg_missing");
    const failing = await setup(async (_command, args) => {
      if (args[0] === "-version") return "ok";
      throw new Error(`Conversion failed for ${args.at(-1)}`);
    });
    const source = await failing.upload(await clip(), "video/mp4", "clip.mp4");
    const failed = await failing.media("trim", {
      sourceId: source.id,
      start: 0,
      duration: 1,
    });
    expect(failed.status).toBe(422);
    const body = await failed.text();
    expect(body).not.toContain(failing.directory);
    expect(await readdir(path.join(failing.directory, "media"))).toHaveLength(
      1,
    );
  });

  it("refuses a result over the ceiling and leaves no partial file", async () => {
    const runs: string[][] = [];
    const { upload, media, directory } = await setup(async (command, args) => {
      if (args[0] === "-version") return "ffmpeg version test";
      if (command === "ffprobe")
        return JSON.stringify({
          format: { duration: "2" },
          streams: [
            {
              codec_type: "video",
              width: 960,
              height: 528,
              r_frame_rate: "24/1",
            },
          ],
        });
      runs.push(args);
      // What `-fs` leaves behind: a file just past the limit, cut short.
      const handle = await open(args.at(-1)!, "w");
      await handle.truncate(MAX_RESULT_BYTES + 1);
      await handle.close();
      return "";
    });
    const video = await upload(await clip(), "video/mp4", "clip.mp4");
    const refused = await media("trim", {
      sourceId: video.id,
      start: 0,
      duration: 1,
    });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/larger than the studio/);
    expect(runs[0].slice(-3, -1)).toEqual([
      "-fs",
      String(MAX_RESULT_BYTES + 1),
    ]);
    expect(await readdir(path.join(directory, "media"))).toHaveLength(1);
  });

  it("refuses an audio cut that would decode past the ceiling before running", async () => {
    const runs: string[][] = [];
    const { upload, media } = await setup(async (command, args) => {
      if (args[0] === "-version") return "ffmpeg version test";
      if (command === "ffprobe")
        return JSON.stringify({
          format: { duration: "1200" },
          streams: [
            {
              codec_type: "audio",
              codec_name: "flac",
              sample_rate: "192000",
              channels: 8,
            },
          ],
        });
      runs.push(args);
      return "";
    });
    // Twenty minutes of 192 kHz FLAC: 8 channels of 16-bit WAV is ~3.7 GB.
    const track = await upload(
      flac(1200 * 192_000, 192_000),
      "audio/flac",
      "long.flac",
    );
    expect(track.duration).toBeCloseTo(1200, 0);
    const refused = await media("trim", {
      sourceId: track.id,
      start: 0,
      duration: 1200,
    });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/larger than the studio/);
    expect(runs).toEqual([]);
  });

  it("puts a room on owned sound with the afir names of the installed ffmpeg", async () => {
    const runs: string[][] = [];
    const fake: Run = async (command, args) => {
      if (args[0] === "-version")
        return "ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023";
      if (command === "ffprobe")
        return JSON.stringify({
          format: { duration: "2" },
          streams: args.at(-1)!.endsWith(".audio")
            ? [{ codec_type: "audio", sample_rate: "8000", channels: 1 }]
            : [
                {
                  codec_type: "video",
                  width: 960,
                  height: 528,
                  r_frame_rate: "24/1",
                },
              ],
        });
      runs.push(args);
      await writeFile(args.at(-1)!, wav(2));
      return "";
    };
    const { upload, media, store } = await setup(fake);
    const track = await upload(wav(2), "audio/wav", "voice.wav");
    const made = await media("space", {
      sourceId: track.id,
      segments: [{ start: 0.5, end: 1.5, preset: "cathedral", level: "low" }],
    });
    expect(made.status).toBe(201);
    const { source } = await made.json();
    expect(source).toMatchObject({
      origin: "derived",
      mediaType: "audio",
      label: "Space of voice.wav",
    });
    expect(
      store.data.sources.find((item) => item.id === source.id)!.derivedFrom,
    ).toEqual([track.id]);
    const graph = runs[0][runs[0].indexOf("-filter_complex") + 1];
    expect(graph).toContain("afir=gtype=none");
    expect(runs[0]).toContain(store.data.sources[0].filePath);
    // A video without sound, a non-room preset and a bad layout are refused
    // before ffmpeg runs.
    const video = await upload(await clip(), "video/mp4", "clip.mp4");
    for (const [body, message] of [
      [
        {
          sourceId: video.id,
          segments: [{ start: 0, end: 1, preset: "small_room" }],
        },
        /no sound/,
      ],
      [
        {
          sourceId: track.id,
          segments: [{ start: 0, end: 1, preset: "outdoor_night" }],
        },
        /ambience, not a room/,
      ],
      [
        {
          sourceId: track.id,
          segments: [
            { start: 0, end: 1.5, preset: "small_room" },
            { start: 1, end: 2, preset: "small_room" },
          ],
        },
        /do not overlap/,
      ],
      [
        {
          sourceId: track.id,
          segments: [{ start: 0, end: 3, preset: "small_room" }],
        },
        /own length/,
      ],
    ] as const) {
      const refused = await media("space", body);
      expect(refused.status).toBe(400);
      expect((await refused.json()).error).toMatch(message);
    }
    expect(runs).toHaveLength(1);
  });
});
