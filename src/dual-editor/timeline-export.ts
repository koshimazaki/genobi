import { withBrowserActivity } from "../activity/store";
import {
  exportResolution,
  framePlacement,
  type MixedSizing,
} from "./export-resolution";
import {
  AudioBufferSink,
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  QUALITY_HIGH,
} from "mediabunny";
import {
  activeClip,
  boundary,
  duration,
  sourceFrame,
  programSegments,
  validateEdit,
  type EditClip,
} from "./timeline-model";
import type { FrameSource } from "./frame-source";

export interface TimelineSource {
  id: string;
  file: File;
  engine: FrameSource;
  url: string;
  thumb: string;
}
async function renderEditImpl(
  clips: EditClip[],
  sources: Map<string, TimelineSource>,
  format: "mp4" | "webm",
  signal: AbortSignal,
  progress: (value: number) => void,
  sizing: MixedSizing = "native",
) {
  const timing = new Map(
    [...sources].map(([id, source]) => [id, source.engine]),
  );
  validateEdit(clips, timing);
  const { width, height, frameRate } = exportResolution(
    clips,
    new Map([...sources].map(([id, s]) => [id, s.engine])),
    sizing,
  )!;
  if (width * height > 40_000_000)
    throw new Error(
      "The native export canvas exceeds 40 megapixels. Export these sources separately.",
    );
  const videoCodec = format === "mp4" ? "avc" : "vp8",
    audioCodec = format === "mp4" ? "aac" : "opus";
  if (!(await canEncodeVideo(videoCodec, { width, height, frameRate })))
    throw new Error(
      `This browser cannot export ${format.toUpperCase()}. Try the other format or Chrome.`,
    );
  const total = duration(clips, timing),
    rate = 48000;
  // Audio buffers retain their presentation timestamps, so trim boundaries preserve sync.
  const sound = new Map<string, { buffer: AudioBuffer; timestamp: number }[]>();
  let audioBytes = 0;
  for (const id of new Set(
    clips.filter((c) => !c.muted).map((c) => c.source),
  )) {
    signal.throwIfAborted();
    const track = await sources.get(id)!.engine.input?.getPrimaryAudioTrack();
    if (!track) continue;
    if (
      !(await track.canDecode()) ||
      !(await canEncodeAudio(audioCodec, {
        sampleRate: rate,
        numberOfChannels: 2,
      }))
    )
      throw new Error(
        "Audio cannot be decoded or exported in this browser. Choose another format, or explicitly mute the clip.",
      );
    const sections = clips.filter((c) => c.source === id && !c.muted),
      engine = sources.get(id)!.engine;
    const start = Math.min(...sections.map((c) => boundary(engine, c.in))),
      end = Math.max(...sections.map((c) => boundary(engine, c.out)));
    const buffers = [];
    for await (const part of new AudioBufferSink(track).buffers(start, end)) {
      signal.throwIfAborted();
      buffers.push(part);
      audioBytes += part.buffer.length * part.buffer.numberOfChannels * 4;
      if (audioBytes > 160 * 1024 ** 2)
        throw new Error(
          "The edit's decoded audio exceeds 160 MB. Use shorter source files or explicitly mute a track.",
        );
    }
    sound.set(id, buffers);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const output = new Output({
    format: format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: QUALITY_HIGH,
  });
  output.addVideoTrack(video, { frameRate });
  const audio = sound.size
    ? new AudioBufferSource({ codec: audioCodec, bitrate: 320_000 })
    : null;
  if (audio) output.addAudioTrack(audio);
  try {
    await output.start();
    const frames = Math.ceil(total * frameRate - 1e-8);
    let lastKey = "";
    const segments = programSegments(clips, timing);
    // Feed audio alongside video to keep muxer queues bounded.
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      const time = i / frameRate,
        end = Math.min(total, (i + 1) / frameRate),
        clip = activeClip(clips, timing, time);
      const engine = clip ? sources.get(clip.source)!.engine : null;
      const at =
        clip && engine ? boundary(engine, clip.in) + time - clip.start : 0;
      const frame = engine
        ? Math.min(clip!.out - 1, sourceFrame(engine, at))
        : -1;
      const key = `${clip?.id}:${frame}`;
      if (key !== lastKey) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        if (engine) {
          const image = await engine.decode(frame);
          const rect = framePlacement(
            image.width,
            image.height,
            width,
            height,
            sizing,
          );
          ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        }
        lastKey = key;
      }
      await video.add(time, end - time);
      if (audio) {
        const startSample = Math.round(time * rate),
          stopSample = Math.round(end * rate);
        const block = new AudioBuffer({
          length: stopSample - startSample,
          sampleRate: rate,
          numberOfChannels: 2,
        });
        const channels = [block.getChannelData(0), block.getChannelData(1)];
        for (const segment of segments) {
          if (
            segment.end <= time ||
            segment.start >= end ||
            !segment.clip ||
            segment.clip.muted
          )
            continue;
          const c = segment.clip,
            parts = sound.get(c.source);
          if (!parts?.length) continue;
          const from = Math.max(startSample, Math.ceil(segment.start * rate)),
            to = Math.min(stopSample, Math.ceil(segment.end * rate));
          const origin = boundary(timing.get(c.source)!, c.in) - c.start;
          let cursor = 0;
          while (
            cursor + 1 < parts.length &&
            parts[cursor + 1].timestamp <= origin + from / rate
          )
            cursor++;
          for (let sample = from; sample < to; sample++) {
            const sourceTime = origin + sample / rate;
            while (
              cursor + 1 < parts.length &&
              parts[cursor + 1].timestamp <= sourceTime
            )
              cursor++;
            const part = parts[cursor];
            if (
              sourceTime < part.timestamp ||
              sourceTime >= part.timestamp + part.buffer.duration
            )
              continue;
            const position =
              (sourceTime - part.timestamp) * part.buffer.sampleRate;
            const i0 = Math.min(part.buffer.length - 1, Math.floor(position)),
              fraction = position - i0;
            for (let channel = 0; channel < 2; channel++) {
              const data = part.buffer.getChannelData(
                Math.min(channel, part.buffer.numberOfChannels - 1),
              );
              const next =
                i0 + 1 < data.length
                  ? data[i0 + 1]
                  : (parts[cursor + 1]?.buffer.getChannelData(
                      Math.min(
                        channel,
                        parts[cursor + 1].buffer.numberOfChannels - 1,
                      ),
                    )[0] ?? data[i0]);
              channels[channel][sample - startSample] =
                data[i0] + (next - data[i0]) * fraction;
            }
          }
        }
        await audio.add(block);
      }
      progress((i + 1) / frames);
      if (i % 15 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    video.close();
    audio?.close();
    await output.finalize();
    return new Blob([output.target.buffer!], {
      type: format === "mp4" ? "video/mp4" : "video/webm",
    });
  } catch (error) {
    await output.cancel();
    throw error;
  }
}

export const renderEdit = (...args: Parameters<typeof renderEditImpl>) =>
  withBrowserActivity("dual-swords", () => renderEditImpl(...args));
