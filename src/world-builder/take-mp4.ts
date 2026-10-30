/**
 * A captured take is VP8 WebM (`export-take.ts`), which the Director cannot
 * import: it reads MP4 only (`src/director/video-source.ts`). This re-encodes
 * the take to MP4 in the browser with mediabunny over WebCodecs, H.264 first
 * and VP9 or AV1 in MP4 where it is missing, as the 3D camera's playblast
 * does, so the take can join the project's assets. The WebM download is
 * unchanged.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";

const CODECS = ["avc", "vp9", "av1"] as const;

export async function takeToMp4(
  video: Blob,
  size: { width: number; height: number },
  signal?: AbortSignal,
): Promise<Blob> {
  const codec = await getFirstEncodableVideoCodec([...CODECS], {
    ...size,
    quality: QUALITY_HIGH,
  });
  if (!codec)
    throw new Error(
      "This browser cannot encode MP4 video. Use current Chrome or Edge, or download the WebM.",
    );
  const input = new Input({
    source: new BlobSource(video),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec, quality: QUALITY_HIGH, forceTranscode: true },
    });
    if (!conversion.isValid)
      throw new Error("This take could not be converted to MP4.");
    const cancel = () => void conversion.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      signal?.throwIfAborted();
      await conversion.execute();
    } catch (error) {
      // A cancel surfaces as the reason given, not the encoder's own error.
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    signal?.throwIfAborted();
    if (!target.buffer) throw new Error("The encoder returned no video.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}
