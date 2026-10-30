import {
  EncodedAudioPacketSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type { DirectorRenderer } from "./renderer";
import { aacConfig, writeAudio } from "./export-audio";

/**
 * The encoder budget. An explicit `?exportMbps=` (2 to 40, rounded;
 * scripts/render-genobi-teaser.mjs passes it for a submission master) wins.
 * Otherwise the 540p rate of 8 Mb/s is kept per pixel, bounded 2 to 32 Mb/s.
 */
export function exportBitrate(
  width: number,
  height: number,
  search = globalThis.location?.search ?? "",
) {
  const asked = Number(new URLSearchParams(search).get("exportMbps"));
  if (Number.isFinite(asked) && asked >= 2 && asked <= 40)
    return Math.round(asked * 1_000_000);
  return Math.round(
    Math.max(
      2_000_000,
      Math.min(32_000_000, (8_000_000 * width * height) / (960 * 540)),
    ),
  );
}

/** Export has no playback clock: slow decoding/encoding only changes wall time. */
export async function exportMp4(
  renderer: DirectorRenderer,
  onFrame: (frame: number) => void,
  signal: AbortSignal,
) {
  const { width, height, fps, durationFrames } =
    renderer.bundle.project.composition;
  const videoConfig = {
    codec: "avc" as const,
    quality: new Quality({ bitrate: exportBitrate(width, height) }),
    latencyMode: "quality" as const,
  };
  const check = () => {
    if (signal.aborted) throw new Error("Render cancelled");
  };
  check();
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo("avc", { ...videoConfig, width, height, frameRate: fps }),
    canEncodeAudio("aac", {
      ...aacConfig,
      numberOfChannels: 2,
      sampleRate: 48000,
    }),
  ]);
  if (!videoSupported || !audioSupported)
    throw new Error(
      "Local MP4 export requires H.264 and AAC WebCodecs encoders. Use current Chrome or Edge with these codecs available.",
    );
  check();
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(renderer.output, videoConfig);
  const audio = new EncodedAudioPacketSource("aac");
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(audio);
  try {
    // Exact-length 48 kHz mix includes offsets, trims, gains and silent gaps.
    const mix = await renderer.mix();
    check();
    await output.start();
    await writeAudio(mix, audio, check);
    for (let frame = 0; frame < durationFrames; frame++) {
      check();
      await renderer.render(frame);
      check();
      await video.add(frame / fps, 1 / fps);
      onFrame(frame);
      // Let React paint progress and process cancellation without a rAF clock.
      if (frame % 8 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    video.close();
    check();
    await output.finalize();
    check();
    if (!target.buffer) throw new Error("MP4 encoder returned no output");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (error) {
    await output.cancel();
    throw error;
  }
}
