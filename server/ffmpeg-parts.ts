// The two ffmpeg argument lists a split upscale needs (`server/upscale-media.ts`),
// built like every other list in server/ffmpeg.ts: fixed arguments from
// validated numbers and server-chosen paths, never request text.
import { even, MP4, output, QUIET, t, type Probe } from "./ffmpeg";

/**
 * The output frame rate: the clip's own fraction when the probe read one,
 * else its rate to the microframe. Set on the output, so the last frame keeps
 * its length and a reader counts it.
 */
const rate = (probe: Probe, fps: number) => probe.video?.rate ?? fps.toFixed(6);

export const partArgs = {
  /**
   * One part of a clip, cut by frame number rather than by time: frames
   * `startFrame` up to `startFrame + frames`, and the sound over the same
   * span. Re-encoded, so the cut is exact wherever the keyframes are.
   */
  cut: (
    file: string,
    probe: Probe,
    startFrame: number,
    frames: number,
    fps: number,
    out: string,
  ) => {
    const end = startFrame + frames;
    const video =
      `[0:v:0]trim=start_frame=${startFrame}:end_frame=${end},` +
      `setpts=PTS-STARTPTS,format=yuv420p[v]`;
    const audio = probe.audio
      ? `;[0:a:0]atrim=start=${t(startFrame / fps)}:end=${t(end / fps)},asetpts=PTS-STARTPTS[a]`
      : "";
    return [
      ...QUIET,
      "-i",
      file,
      "-filter_complex",
      video + audio,
      "-map",
      "[v]",
      ...(probe.audio ? ["-map", "[a]"] : []),
      "-frames:v",
      String(frames),
      "-r",
      rate(probe, fps),
      ...MP4,
      ...output(out),
    ];
  },
  /**
   * The upscaled parts joined in order, at the first part's even size and the
   * source's frame rate, with the ORIGINAL clip's sound: an upscaler may drop
   * or re-time it. Each part is held to its planned frame count (its last
   * picture repeated if the upscaler returned fewer, cut if more), so the
   * result has exactly the source's frames.
   */
  join: (
    parts: { file: string; frames: number }[],
    first: Probe,
    original: { file: string; probe: Probe },
    fps: number,
    out: string,
  ) => {
    const width = even(first.video!.width);
    const height = even(first.video!.height);
    const total = parts.reduce((sum, part) => sum + part.frames, 0);
    const inputs = [...parts.map((part) => part.file), original.file].flatMap(
      (file) => ["-i", file],
    );
    const sound = Boolean(original.probe.audio);
    const graph = [
      ...parts.map(
        (part, i) =>
          `[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${rate(original.probe, fps)},` +
          `tpad=stop_mode=clone:stop=${part.frames},trim=end_frame=${part.frames},` +
          `setpts=PTS-STARTPTS,format=yuv420p[v${i}]`,
      ),
      parts.map((_, i) => `[v${i}]`).join("") +
        `concat=n=${parts.length}:v=1:a=0[v]`,
      ...(sound
        ? [
            `[${parts.length}:a:0]atrim=duration=${t(total / fps)},asetpts=PTS-STARTPTS[a]`,
          ]
        : []),
    ].join(";");
    return [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      graph,
      "-map",
      "[v]",
      ...(sound ? ["-map", "[a]"] : []),
      "-frames:v",
      String(total),
      "-r",
      rate(original.probe, fps),
      ...MP4,
      ...output(out),
    ];
  },
};

/**
 * A clip's frame count: the container's own count, else its length at its
 * frame rate. Undefined when neither is readable.
 */
export function frameCount(probe: Probe, duration: number) {
  const video = probe.video;
  if (!video || !(video.fps > 0)) return undefined;
  if (video.frames) return video.frames;
  const frames = Math.round(duration * video.fps);
  return frames > 0 ? frames : undefined;
}
