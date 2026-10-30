import { withBrowserActivity } from "../activity/store";
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type AudioCodec,
  type VideoCodec,
  type TransformationMatrix,
  type EncodedPacket,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import { boundary, type EditClip } from "./timeline-model";
import type { TimelineSource } from "./timeline-export";
import {
  COPY_EPSILON as EPS,
  copyError,
  decoderIdentity,
  losslessSegments,
} from "./lossless-plan";

async function videoRange(
  track: InputVideoTrack,
  start: number,
  end: number,
  eof: number,
  signal: AbortSignal,
) {
  const sink = new EncodedPacketSink(track);
  const first = await sink.getKeyPacket(start + EPS, {
    verifyKeyPackets: true,
  });
  if (!first || Math.abs(first.timestamp - start) > EPS)
    copyError("the first frame of a section is not a keyframe.");
  const stop =
    Math.abs(end - eof) < EPS
      ? null
      : await sink.getKeyPacket(end + EPS, {
          verifyKeyPackets: true,
        });
  if (
    Math.abs(end - eof) >= EPS &&
    (!stop || Math.abs(stop.timestamp - end) > EPS)
  )
    copyError("the last boundary of a section is not a keyframe.");
  for await (const packet of sink.packets(first, stop ?? undefined, {
    metadataOnly: true,
  })) {
    signal.throwIfAborted();
    if (
      packet.timestamp < start - EPS ||
      packet.timestamp + packet.duration > end + EPS
    )
      copyError(
        "this GOP crosses the requested cut. Its dependent frames cannot be removed safely.",
      );
  }
  return { sink, first, stop };
}
async function audioRange(
  track: InputAudioTrack,
  start: number,
  end: number,
  signal: AbortSignal,
) {
  const sink = new EncodedPacketSink(track);
  const first = await sink.getPacket(start + EPS);
  if (!first || Math.abs(first.timestamp - start) > EPS)
    copyError("audio packets cross the start of this cut.");
  let covered = start;
  for await (const packet of sink.packets(first, undefined, {
    metadataOnly: true,
  })) {
    signal.throwIfAborted();
    if (packet.timestamp >= end - EPS) break;
    if (packet.timestamp + packet.duration > end + EPS)
      copyError("audio packets cross the end of this cut.");
    covered = packet.timestamp + packet.duration;
  }
  if (Math.abs(covered - end) > EPS)
    copyError("audio does not cover the requested section exactly.");
  return { sink, first };
}
/** Compressed bytes are copied; no decoder, canvas, resampler or encoder participates. */
async function copyEditImpl(
  clips: EditClip[],
  sources: Map<string, TimelineSource>,
  format: "mp4" | "webm",
  signal: AbortSignal,
  progress: (value: number) => void,
): Promise<Blob> {
  signal.throwIfAborted();
  const timing = new Map([...sources].map(([id, s]) => [id, s.engine]));
  const segments = losslessSegments(clips, timing);
  const container =
    format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  // A complete, unchanged source can retain all original tracks, priming and metadata byte-for-byte.
  if (segments.length === 1) {
    const segment = segments[0],
      source = sources.get(segment.source)!;
    const mime = await source.engine.input?.getMimeType();
    if (
      !segment.muted &&
      Math.abs(segment.start) < EPS &&
      Math.abs(boundary(source.engine, 0)) < EPS &&
      Math.abs(
        segment.end - boundary(source.engine, source.engine.frames.length),
      ) < EPS &&
      mime?.split(";")[0] === container.mimeType
    ) {
      signal.throwIfAborted();
      progress(1);
      return source.file;
    }
  }
  const prepared: {
    source: string;
    start: number;
    end: number;
    at: number;
    muted: boolean;
    video: Awaited<ReturnType<typeof videoRange>>;
    codec: VideoCodec;
    config: VideoDecoderConfig;
    matrix: TransformationMatrix;
    audio: Awaited<ReturnType<typeof audioRange>> | null;
    audioCodec: AudioCodec | null;
    audioConfig: AudioDecoderConfig | null;
  }[] = [];
  let videoIdentity = "",
    audioIdentity = "";
  for (const segment of segments) {
    signal.throwIfAborted();
    const source = sources.get(segment.source)!,
      input = source.engine.input;
    if (!input) copyError("this source is not a video.");
    const videos = await input.getVideoTracks(),
      audios = await input.getAudioTracks();
    if (videos.length !== 1 || audios.length > 1)
      copyError(
        "this file has additional media tracks. Export it unchanged or use Native exact cuts for the primary picture and sound.",
      );
    const track = videos[0],
      codec = await track.getCodec(),
      config = await track.getDecoderConfig();
    const matrix = await track.getTransformationMatrix();
    if (
      !codec ||
      !config ||
      !container.getSupportedVideoCodecs().includes(codec)
    )
      copyError(
        "this container cannot hold the original video codec. Try the other format.",
      );
    const identity = decoderIdentity({ config, matrix });
    if (videoIdentity && videoIdentity !== identity)
      copyError(
        "these clips have different resolutions or codec settings. They cannot share one lossless video track.",
      );
    videoIdentity = identity;
    const video = await videoRange(
      track,
      segment.start,
      segment.end,
      boundary(source.engine, source.engine.frames.length),
      signal,
    );
    const audioTrack = segment.muted ? null : audios[0];
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const audioConfig = audioTrack ? await audioTrack.getDecoderConfig() : null;
    if (
      audioTrack &&
      (!audioCodec ||
        !audioConfig ||
        !container.getSupportedAudioCodecs().includes(audioCodec))
    )
      copyError(
        "this container cannot hold the original audio codec. Try the other format or explicitly mute the clip.",
      );
    const soundIdentity = audioTrack ? decoderIdentity(audioConfig) : "";
    if (audioIdentity && soundIdentity && audioIdentity !== soundIdentity)
      copyError("audio codec settings differ between clips.");
    if (soundIdentity) audioIdentity = soundIdentity;
    const audio = audioTrack
      ? await audioRange(audioTrack, segment.start, segment.end, signal)
      : null;
    prepared.push({
      ...segment,
      video,
      codec,
      config,
      matrix,
      audio,
      audioCodec,
      audioConfig,
    });
  }
  const output = new Output({ format: container, target: new BufferTarget() });
  const video = new EncodedVideoPacketSource(prepared[0].codec);
  output.addVideoTrack(video, {
    transformationMatrix: prepared[0].matrix,
    decoderConfig: prepared[0].config,
  });
  const sound = prepared.find((s) => s.audio);
  const audio = sound?.audioCodec
    ? new EncodedAudioPacketSource(sound.audioCodec)
    : null;
  if (audio) output.addAudioTrack(audio);
  let bytes = 0;
  function shifted(packet: EncodedPacket, segment: (typeof prepared)[number]) {
    signal.throwIfAborted();
    bytes += packet.byteLength;
    if (bytes > 512 * 1024 ** 2)
      copyError(
        "the copied edit exceeds the 512 MB in-memory limit. Export shorter sections.",
      );
    return packet.clone({
      timestamp: packet.timestamp - segment.start + segment.at,
    });
  }
  try {
    await output.start();
    for (let i = 0; i < prepared.length; i++) {
      const s = prepared[i];
      await Promise.all([
        (async () => {
          for await (const packet of s.video.sink.packets(
            s.video.first,
            s.video.stop ?? undefined,
          )) {
            await video.add(shifted(packet, s), { decoderConfig: s.config });
          }
        })(),
        (async () => {
          if (!s.audio || !audio) return;
          for await (const packet of s.audio.sink.packets(s.audio.first)) {
            if (packet.timestamp >= s.end - EPS) break;
            await audio.add(shifted(packet, s), {
              decoderConfig: s.audioConfig!,
            });
          }
        })(),
      ]);
      progress((i + 1) / prepared.length);
    }
    signal.throwIfAborted();
    video.close();
    audio?.close();
    await output.finalize();
    signal.throwIfAborted();
    return new Blob([output.target.buffer!], { type: container.mimeType });
  } catch (error) {
    await output.cancel();
    throw error;
  }
}

export const copyEdit = (...args: Parameters<typeof copyEditImpl>) =>
  withBrowserActivity("dual-swords", () => copyEditImpl(...args));
