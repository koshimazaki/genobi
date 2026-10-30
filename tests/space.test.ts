import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { afirStyle, ffmpegArgs, type Probe } from "../server/ffmpeg";
import {
  roomResponse,
  snapSegments,
  SPACE_PRESETS,
  SPACE_ROOMS,
  validateSpace,
  wetDb,
  type SpaceSegment,
} from "../shared/space";

// The space tool's pure parts: presets from the AKUSPACE file, request
// validation, snapping to the composition grid, and the ffmpeg graph for
// both afir option styles. No ffmpeg needed; space-render.test.ts runs it.
const presets = JSON.parse(
  readFileSync("shared/akuspace-presets.json", "utf8"),
) as {
  control_schema: { room_presets: string[] };
  levels: Record<string, { relative_db: number }>;
  presets: Record<string, { estimated_rt60: number }>;
};
const segment = (
  start: number,
  end: number,
  preset: SpaceSegment["preset"] = "medium_room",
): SpaceSegment => ({ start, end, preset, level: "mid" });
const refusal = (request: object, duration = 10) => {
  try {
    validateSpace({ sourceId: "a", ...request }, duration);
  } catch (error) {
    return (error as Error).message;
  }
  return "accepted";
};

describe("space presets", () => {
  it("are the AKUSPACE rooms, with their decay and level read from the presets file", () => {
    expect([...SPACE_PRESETS]).toEqual(presets.control_schema.room_presets);
    expect(
      SPACE_PRESETS.map((preset) => SPACE_ROOMS[preset].rt60Seconds),
    ).toEqual(
      SPACE_PRESETS.map((preset) => presets.presets[preset].estimated_rt60),
    );
    // The three rooms whose trained caption states a decay.
    expect(SPACE_ROOMS.small_room.rt60Seconds).toBe(0.67);
    expect(SPACE_ROOMS.empty_club.rt60Seconds).toBe(1.2);
    expect(SPACE_ROOMS.medium_room.rt60Seconds).toBe(1.9);
    for (const level of ["low", "mid", "high"] as const)
      expect(wetDb(level)).toBe(presets.levels[level].relative_db);
  });

  it("describe each room as a decaying noise response", () => {
    const room = roomResponse("empty_club");
    expect(room).toMatchObject({
      sampleRate: 48000,
      rt60Seconds: 1.2,
      durationSeconds: 1.44,
      lowpassHz: 5000,
    });
    // 60 dB down after one RT60.
    expect(20 * Math.log10(Math.exp(-room.decayPerSecond * 1.2))).toBeCloseTo(
      -60,
      6,
    );
    expect(room.seeds[0]).not.toBe(room.seeds[1]);
  });
});

describe("space requests", () => {
  it("accept ordered segments inside the clip, with mid as the default level", () => {
    const request = validateSpace(
      {
        sourceId: "a",
        segments: [
          { start: 0, end: 2, preset: "small_room" },
          { start: 2, end: 4, preset: "cathedral", level: "high" },
        ],
      },
      4,
    );
    expect(request.segments).toEqual([
      { start: 0, end: 2, preset: "small_room", level: "mid" },
      { start: 2, end: 4, preset: "cathedral", level: "high" },
    ]);
  });

  it("refuse overlap, disorder, times outside the clip and bad counts", () => {
    const one = { preset: "medium_room" };
    expect(
      refusal({
        segments: [
          { ...one, start: 0, end: 3 },
          { ...one, start: 2, end: 4 },
        ],
      }),
    ).toMatch(/do not overlap/);
    expect(
      refusal({
        segments: [
          { ...one, start: 5, end: 6 },
          { ...one, start: 1, end: 2 },
        ],
      }),
    ).toMatch(/run in order/);
    expect(refusal({ segments: [{ ...one, start: 9, end: 11 }] })).toMatch(
      /own length/,
    );
    expect(refusal({ segments: [{ ...one, start: -1, end: 1 }] })).toMatch(
      /start in seconds, at least 0/,
    );
    expect(refusal({ segments: [{ ...one, start: 1, end: 1.05 }] })).toMatch(
      /at least 0.1 seconds/,
    );
    expect(refusal({ segments: [{ ...one, start: "0", end: 1 }] })).toMatch(
      /start in seconds/,
    );
    expect(refusal({ segments: [] })).toMatch(/one to 16 segments/);
    expect(
      refusal({
        segments: Array.from({ length: 17 }, (_, i) => ({
          ...one,
          start: i * 0.5,
          end: i * 0.5 + 0.2,
        })),
      }),
    ).toMatch(/one to 16 segments/);
    expect(
      refusal({ segments: [{ ...one, start: 0, end: 1, level: "max" }] }),
    ).toMatch(/Choose a level/);
  });

  it("refuse ambience, delay and anything that is not a room", () => {
    const bad = (preset: string) =>
      refusal({ segments: [{ start: 0, end: 1, preset }] });
    expect(bad("outdoor_day")).toMatch(/ambience, not a room/);
    expect(bad("outdoor_night")).toMatch(/ambience, not a room/);
    expect(bad("dual_delay")).toMatch(/no delay/);
    expect(bad("dry")).toMatch(/no room/);
    expect(bad("toString")).toMatch(/Choose a room: small_room/);
    expect(bad("hall")).toMatch(/Choose a room/);
  });

  it("check a grid's bounds and refuse a grid without snap", () => {
    const segments = [{ start: 0, end: 1, preset: "small_room" }];
    expect(refusal({ segments, snap: "bar", grid: { bpm: 400 } })).toMatch(
      /bpm must be a number from 20 to 300/,
    );
    expect(
      refusal({ segments, snap: "bar", grid: { beatsPerBar: 3.5 } }),
    ).toMatch(/beatsPerBar must be a whole number/);
    expect(refusal({ segments, snap: "phrase" })).toMatch(/"beat" or "bar"/);
    expect(refusal({ segments, grid: { bpm: 120 } })).toMatch(/only used/);
  });
});

describe("snapping to the composition grid", () => {
  // 100 BPM: a beat every 0.6 s, a bar of 4 every 2.4 s, downbeat at 0.5 s.
  const grid = { bpm: 100, beatOffsetSeconds: 0.5, beatsPerBar: 4 };

  it("moves each edge to the nearest beat or bar line", () => {
    const segments = [segment(1.0, 2.05), segment(3.2, 6.1)];
    expect(snapSegments(segments, grid, "beat")).toEqual([
      segment(1.1, 2.3),
      segment(3.5, 5.9),
    ]);
    expect(snapSegments(segments, grid, "bar")).toEqual([
      segment(0.5, 2.9),
      segment(2.9, 5.3),
    ]);
  });

  it("uses the timeline's defaults and holds edges inside the clip", () => {
    // 120 BPM, 4 beats a bar: bars every 2 s from 0.
    expect(snapSegments([segment(0.9, 7.2)], {}, "bar", 7.5)).toEqual([
      segment(0, 7.5),
    ]);
  });

  it("refuses segments that snapping collapses or runs together", () => {
    expect(
      refusal({
        segments: [{ start: 1, end: 1.5, preset: "small_room" }],
        snap: "bar",
        grid,
      }),
    ).toMatch(/at least 0.1 seconds once snapped to the bar/);
    const snapped = validateSpace(
      {
        sourceId: "a",
        segments: [{ start: 1, end: 2, preset: "small_room" }],
        snap: "beat",
        grid,
      },
      10,
    );
    expect(snapped.segments).toEqual([
      { start: 1.1, end: 2.3, preset: "small_room", level: "mid" },
    ]);
  });
});

describe("the space filter graph", () => {
  const audio: Probe = {
    duration: 6,
    audio: { sampleRate: 44100, channels: 1, codec: "pcm_s16le" },
  };
  const segments: SpaceSegment[] = [
    { start: 0.5, end: 2, preset: "small_room", level: "low" },
    { start: 5, end: 6, preset: "cathedral", level: "high" },
  ];
  const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1];

  it("names afir's options for ffmpeg 6 and for ffmpeg 7", () => {
    const six = graph(
      ffmpegArgs.space("audio", "/in.audio", audio, segments, "/o", "gtype"),
    );
    const seven = graph(
      ffmpegArgs.space("audio", "/in.audio", audio, segments, "/o", "irnorm"),
    );
    expect(six).toContain("afir=gtype=none:irgain=1:dry=1:wet=1");
    expect(six).not.toContain("irnorm");
    expect(seven).toContain("afir=irnorm=-1:irgain=1:dry=1:wet=1");
    expect(seven).not.toContain("gtype");
    expect(six.replaceAll("gtype=none", "irnorm=-1")).toBe(seven);
    expect(afirStyle("ffmpeg version 6.1.1-3ubuntu5 Copyright")).toBe("gtype");
    expect(afirStyle("ffmpeg version n5.1.4")).toBe("gtype");
    expect(afirStyle("ffmpeg version 7.1 Copyright")).toBe("irnorm");
    expect(afirStyle("ffmpeg version N-117000-gabc")).toBe("irnorm");
    expect(afirStyle("")).toBe("irnorm");
  });

  it("trims, fades, convolves, levels, delays and mixes each segment onto the dry sound", () => {
    const g = graph(ffmpegArgs.space("audio", "/in", audio, segments, "/o"));
    expect(g).toMatch(
      /^\[0:a:0\]aformat=sample_rates=48000:channel_layouts=stereo,asplit=3\[dry\]\[s0\]\[s1\];/,
    );
    expect(g).toContain(
      "[s0]atrim=start=0.500:end=2.000,asetpts=PTS-STARTPTS,afade=t=in:d=0.020,afade=t=out:st=1.480:d=0.020,apad=pad_dur=0.804[x0]",
    );
    // The last segment ends at the clip's end: no tail to pad.
    expect(g).toContain("afade=t=out:st=0.980:d=0.020[x1]");
    expect(g).toContain("volume=-25dB,adelay=delays=24000S:all=1[w0]");
    expect(g).toContain("volume=0dB,adelay=delays=240000S:all=1[w1]");
    expect(g).toContain(":s=48000:d=5.760,lowpass=f=6000[ir1]");
    expect(g).toMatch(
      /\[dry\]\[w0\]\[w1\]amix=inputs=3:duration=first:dropout_transition=0:normalize=0\[a\]$/,
    );
  });

  it("copies a video's picture and writes WAV for audio, within the size ceiling", () => {
    const video = ffmpegArgs.space(
      "video",
      "/in.mp4",
      { ...audio, video: { width: 640, height: 360, fps: 24, codec: "h264" } },
      segments,
      "/out.mp4",
    );
    expect(video.slice(video.indexOf("-map"))).toEqual([
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "-fs",
      "250000001",
      "/out.mp4",
    ]);
    const wav = ffmpegArgs.space("audio", "/in", audio, segments, "/out");
    expect(wav.slice(wav.indexOf("-map"))).toEqual([
      "-map",
      "[a]",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "-fs",
      "250000001",
      "/out",
    ]);
  });
});
