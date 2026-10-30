import { BufferSource, CanvasSink, Input, MP4 } from "mediabunny";

/** Read presentation duration from samples, not rounded container metadata. */
export async function videoDuration(bytes: Uint8Array<ArrayBuffer>) {
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track");
    const duration = await input.computeDuration([track]);
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Media duration unavailable");
    return duration;
  } finally {
    input.dispose();
  }
}

/** Decode the presentation frame covering a timestamp, independent of playback. */
export async function openVideo(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error(`Video decoder unavailable: ${name}`);
    const duration = await input.computeDuration([track]);
    const sink = new CanvasSink(track, { poolSize: 1, alpha: true });
    return {
      duration,
      async at(seconds: number) {
        const frame = await sink.getCanvas(seconds);
        if (!frame) throw new Error(`No video frame at ${seconds}s: ${name}`);
        return frame.canvas;
      },
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

/**
 * One small poster frame, decoded with the same demuxer the preview uses: no
 * media element, object URL or server round trip, and only the packets from
 * the nearest keyframe to `seconds` are decoded.
 */
export async function videoPoster(
  bytes: Uint8Array<ArrayBuffer>,
  seconds: number,
  maxWidth = 240,
) {
  const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const width = Math.max(1, Math.min(maxWidth, track.displayWidth));
    const sink = new CanvasSink(track, { width, poolSize: 1 });
    const first = await track.getFirstTimestamp();
    const frame = await sink.getCanvas(Math.max(seconds, first));
    return frame?.canvas ?? null;
  } finally {
    input.dispose();
  }
}
