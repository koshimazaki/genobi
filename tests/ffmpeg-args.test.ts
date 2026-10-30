import { describe, expect, it } from "vitest";
import { ffmpegArgs, parseProbe, type Probe } from "../server/ffmpeg";

// Pure argument building and probe parsing: no ffmpeg and no server needed.
const picture: Probe = {
  duration: 10,
  video: { width: 961, height: 528, fps: 23.976, codec: "h264" },
};
const withSound: Probe = {
  ...picture,
  audio: { sampleRate: 48000, channels: 2, codec: "aac" },
};

describe("ffmpeg arguments are fixed and built from numbers", () => {
  it("trims video and audio with named output formats", () => {
    expect(
      ffmpegArgs.trim("video", "/in.mp4", picture, 1.25, 2, "/out.mp4"),
    ).toEqual([
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-ss",
      "1.250",
      "-i",
      "/in.mp4",
      "-t",
      "2.000",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      // An odd 961-wide clip is fitted to 960, since yuv420p needs even sides.
      "-vf",
      "scale=960:528:force_original_aspect_ratio=decrease,pad=960:528:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
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
    expect(
      ffmpegArgs.trim("audio", "/in.audio", picture, 0, 1, "/out.audio"),
    ).toEqual([
      "-hide_banner",
      "-nostdin",
      "-v",
      "error",
      "-y",
      "-ss",
      "0.000",
      "-i",
      "/in.audio",
      "-t",
      "1.000",
      "-vn",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "-fs",
      "250000001",
      "/out.audio",
    ]);
    expect(ffmpegArgs.frame("/in.mp4", 3, "/f.image").slice(-9)).toEqual([
      "-frames:v",
      "1",
      "-c:v",
      "png",
      "-f",
      "image2",
      "-fs",
      "250000001",
      "/f.image",
    ]);
  });

  it("caps every output's size while ffmpeg writes it", () => {
    for (const args of [
      ffmpegArgs.concat("video", ["/a", "/b"], [picture, picture], "/o"),
      ffmpegArgs.concat("audio", ["/a", "/b"], [], "/o"),
      ffmpegArgs.crossfade(
        "video",
        ["/a", "/b"],
        [picture, picture],
        [2, 2],
        1,
        "/o",
      ),
      ffmpegArgs.crossfade(
        "audio",
        ["/a", "/b"],
        [picture, picture],
        [2, 2],
        1,
        "/o",
      ),
    ])
      expect(args.slice(-3)).toEqual(["-fs", "250000001", "/o"]);
  });

  it("fits joined video to the first clip and keeps sound only if all have it", () => {
    const silent = ffmpegArgs.concat(
      "video",
      ["/a", "/b"],
      [withSound, picture],
      "/o",
    );
    const graph = silent[silent.indexOf("-filter_complex") + 1];
    expect(graph).toContain(
      "scale=960:528:force_original_aspect_ratio=decrease",
    );
    expect(graph).toContain("fps=24");
    expect(graph).toContain("[v0][v1]concat=n=2:v=1:a=0[v]");
    expect(silent).not.toContain("[a]");
    const sound = ffmpegArgs.concat(
      "video",
      ["/a", "/b"],
      [withSound, withSound],
      "/o",
    );
    expect(sound[sound.indexOf("-filter_complex") + 1]).toContain(
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
    );
    const audio = ffmpegArgs.concat("audio", ["/a", "/b", "/c"], [], "/o");
    expect(audio[audio.indexOf("-filter_complex") + 1]).toContain(
      "[a0][a1][a2]concat=n=3:v=0:a=1[a]",
    );
  });

  it("starts a crossfade where the first clip ends, less the overlap", () => {
    const args = ffmpegArgs.crossfade(
      "video",
      ["/a", "/b"],
      [withSound, withSound],
      [4, 3],
      0.5,
      "/o",
    );
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain(
      "xfade=transition=fade:duration=0.500:offset=3.500",
    );
    // Each clip's picture and sound are held to the reader's length first, so
    // a picture that ends before its sound cannot end before the fade starts.
    expect(graph).toContain(
      "tpad=stop_mode=clone:stop_duration=4.000,trim=duration=4.000,setpts=PTS-STARTPTS,fps=24,format=yuv420p[v0]",
    );
    expect(graph).toContain("trim=duration=3.000,setpts=PTS-STARTPTS");
    expect(graph).toContain(
      "apad=whole_dur=4.000,atrim=duration=4.000,asetpts=PTS-STARTPTS[a0]",
    );
    expect(graph).toContain("apad=whole_dur=3.000,atrim=duration=3.000");
    expect(graph).toContain("[a0][a1]acrossfade=d=0.500[a]");
    const audio = ffmpegArgs.crossfade(
      "audio",
      ["/a", "/b"],
      [picture, picture],
      [2, 2],
      1,
      "/o",
    );
    expect(audio).toContain("[a]");
    expect(audio[audio.indexOf("-filter_complex") + 1]).not.toContain("apad");
  });

  it("reads only bounded probe fields", () => {
    expect(
      parseProbe(
        JSON.stringify({
          format: { duration: "2.5", filename: "/private/path" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 960,
              height: 528,
              r_frame_rate: "24000/1001",
            },
            {
              codec_type: "audio",
              codec_name: "aac",
              sample_rate: "48000",
              channels: 2,
            },
          ],
        }),
      ),
    ).toEqual({
      duration: 2.5,
      video: {
        width: 960,
        height: 528,
        fps: 24000 / 1001,
        codec: "h264",
        rate: "24000/1001",
      },
      audio: { sampleRate: 48000, channels: 2, codec: "aac" },
    });
    expect(() => parseProbe("not json")).toThrow();
    expect(() => parseProbe('{"format":{}}')).toThrow();
  });
});
