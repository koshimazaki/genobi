import { describe, expect, it } from "vitest";
import { partArgs, frameCount } from "../server/ffmpeg-parts";
import { parseProbe } from "../server/ffmpeg";
import { checkUpscaleLimits } from "../shared/mp4";
import {
  combinedUsd,
  MAX_UPSCALE_PARTS,
  needsParts,
  partKey,
  planParts,
  PlanRefusal,
  UPSCALE_MAX_SECONDS,
  UPSCALE_PART_MAX_SECONDS,
  UPSCALE_SPLIT_MAX_SECONDS,
} from "../shared/upscale-parts";
import { IDEMPOTENCY_KEY } from "../shared/idempotency";

describe("the split plan", () => {
  it("cuts the 23.125 s Dimensions mix at 19 s: 456 + 99 frames at 24 fps", () => {
    const plan = planParts(555, 24);
    expect(plan.parts.map((p) => p.frames)).toEqual([456, 99]);
    expect(plan.parts.map((p) => p.startFrame)).toEqual([0, 456]);
    expect(plan.parts[0].duration).toBe(19);
    // The 4.125 s tail is a part of its own: no whole-second rule applies.
    expect(plan.parts[1].duration).toBe(4.125);
    expect(plan.parts.reduce((sum, p) => sum + p.frames, 0)).toBe(555);
  });

  it("cuts full 19 s parts and the remainder, contiguous and exact", () => {
    for (const [frames, fps] of [
      [481, 24],
      [1800, 29.97],
      [2400, 25],
      [2880, 24],
      [7200, 60],
    ]) {
      const plan = planParts(frames, fps);
      const full = Math.floor(UPSCALE_PART_MAX_SECONDS * fps);
      let next = 0;
      for (const part of plan.parts) {
        expect(part.startFrame).toBe(next);
        expect(part.duration).toBeLessThanOrEqual(UPSCALE_MAX_SECONDS);
        next += part.frames;
      }
      expect(next).toBe(frames);
      for (const part of plan.parts.slice(0, -1))
        expect(part.frames).toBeGreaterThanOrEqual(full);
    }
  });

  it("folds a tail under 1 s into the part before it, within 20 s", () => {
    // 456 + 456 + 10 frames: the 10-frame tail joins the second part.
    expect(planParts(922, 24).parts.map((p) => p.frames)).toEqual([456, 466]);
    // Exactly 1 s is a part of its own.
    expect(planParts(480, 24).parts.map((p) => p.frames)).toEqual([456, 24]);
  });

  it("shares the last two parts when the fold would pass the limit", () => {
    // 19.5 s parts under a 20 s limit: 468 + 23 frames would be 20.46 s.
    const plan = planParts(468 + 23, 24, 19.5, 20);
    expect(plan.parts.map((p) => p.frames)).toEqual([246, 245]);
  });

  it("takes a longer part length where the run allows it, or one part", () => {
    expect(planParts(555, 24, 60, 120).parts.map((p) => p.frames)).toEqual([
      555,
    ]);
    expect(() => planParts(555, 24, 60, 20)).toThrow(PlanRefusal);
  });

  it("covers the media tools' two minutes and refuses past them", () => {
    expect(planParts(UPSCALE_SPLIT_MAX_SECONDS * 24, 24).parts.length).toBe(
      MAX_UPSCALE_PARTS,
    );
    expect(() => planParts(200 * 24, 24)).toThrow(PlanRefusal);
    expect(() => planParts(0, 24)).toThrow(PlanRefusal);
    expect(() => planParts(100, 0)).toThrow(PlanRefusal);
  });

  it("splits only past 20 s, and adds the parts' quotes", () => {
    expect(needsParts({ duration: 20 })).toBe(false);
    expect(needsParts({ duration: 23.125 })).toBe(true);
    expect(combinedUsd([{ estimateUsd: 0.1 }, { estimateUsd: 0.2 }])).toBe(0.3);
    expect(IDEMPOTENCY_KEY.test(partKey(crypto.randomUUID(), 6, 12))).toBe(
      true,
    );
  });

  it("keeps one upscale's 20 s ceiling, and the split ceiling for uploads", () => {
    const clip = { width: 960, height: 540, duration: 23.125 };
    expect(() => checkUpscaleLimits(clip, 1)).toThrow("20 seconds");
    expect(checkUpscaleLimits(clip, 1, UPSCALE_SPLIT_MAX_SECONDS)).toBe(clip);
  });
});

describe("the split's ffmpeg arguments", () => {
  const probe = parseProbe(
    JSON.stringify({
      format: { duration: "23.15" },
      streams: [
        {
          codec_type: "video",
          width: 960,
          height: 540,
          r_frame_rate: "24/1",
          nb_frames: "555",
        },
        { codec_type: "audio", sample_rate: "48000", channels: 2 },
      ],
    }),
  );

  it("reads the frame count the container states", () => {
    expect(frameCount(probe, 23.15)).toBe(555);
    const { video } = probe;
    expect(
      frameCount({ ...probe, video: { ...video!, frames: undefined } }, 2),
    ).toBe(48);
  });

  it("cuts by frame number and keeps the span's sound", () => {
    const args = partArgs.cut("in.mp4", probe, 456, 99, 24, "out.mp4");
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("trim=start_frame=456:end_frame=555");
    expect(graph).toContain("atrim=start=19.000:end=23.125");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("99");
  });

  it("joins at the source's frames with the original's sound", () => {
    const upscaled = { ...probe, video: { ...probe.video!, width: 1921 } };
    const args = partArgs.join(
      [
        { file: "a.mp4", frames: 456 },
        { file: "b.mp4", frames: 99 },
      ],
      upscaled,
      { file: "source.mp4", probe },
      24,
      "out.mp4",
    );
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(args.filter((a) => a === "-i")).toHaveLength(3);
    expect(graph).toContain("scale=1920:540");
    expect(graph).toContain("tpad=stop_mode=clone:stop=456,trim=end_frame=456");
    expect(graph).toContain("[2:a:0]atrim=duration=23.125");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("555");
    const silent = partArgs.join(
      [{ file: "a.mp4", frames: 10 }],
      upscaled,
      { file: "s.mp4", probe: { ...probe, audio: undefined } },
      24,
      "o.mp4",
    );
    expect(silent).not.toContain("[a]");
  });
});
