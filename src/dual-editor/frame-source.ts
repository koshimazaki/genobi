import {
  Input,
  BlobSource,
  ALL_FORMATS,
  EncodedPacketSink,
  VideoSampleSink,
} from "mediabunny";
import { frameIndex, type FramePoint } from "./frame-math";

/** Browser-local decoding boundary, reusable independently of the React workspace. */
export class FrameSource {
  private constructor(
    readonly input: Input | null,
    readonly sink: VideoSampleSink | null,
    readonly name: string,
    readonly frames: FramePoint[],
    readonly width: number,
    readonly height: number,
    readonly codec: string,
    readonly file: File,
    readonly image?: HTMLCanvasElement,
  ) {}

  static async open(
    file: File,
    signal: AbortSignal,
    progress: (count: number) => void,
  ) {
    if (!file.size) throw new Error("This file is empty.");
    if (file.size > 4 * 1024 ** 3)
      throw new Error("Choose a video smaller than 4 GB.");
    if (
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp)$/i.test(file.name)
    ) {
      if (file.size > 64 * 1024 ** 2)
        throw new Error("Choose an image below 64 MB.");
      const bitmap = await createImageBitmap(file);
      try {
        signal.throwIfAborted();
        if (bitmap.width * bitmap.height > 40_000_000)
          throw new Error("Choose an image below 40 megapixels.");
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        return new FrameSource(
          null,
          null,
          file.name,
          [{ timestamp: 0, duration: 1 }],
          canvas.width,
          canvas.height,
          "image",
          file,
          canvas,
        );
      } finally {
        bitmap.close();
      }
    }
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });
    const abort = () => input.dispose();
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      const track = await input.getPrimaryVideoTrack();
      if (!track)
        throw new Error(
          "No video track found. Choose an MP4, MOV or WebM video.",
        );
      if (!(await track.canDecode()))
        throw new Error(
          "This browser cannot decode this video codec. Try Chrome, or an H.264 MP4.",
        );
      const width = await track.getDisplayWidth(),
        height = await track.getDisplayHeight();
      if (width * height > 40_000_000)
        throw new Error("Choose a video below 40 megapixels per frame.");
      const points: FramePoint[] = [];
      const packets = new EncodedPacketSink(track);
      for await (const packet of packets.packets(undefined, undefined, {
        metadataOnly: true,
      })) {
        signal.throwIfAborted();
        points.push({ timestamp: packet.timestamp, duration: packet.duration });
        if (points.length > 1_000_000)
          throw new Error("This clip exceeds the one-million-frame limit.");
        if (points.length % 2000 === 0) {
          progress(points.length);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      signal.throwIfAborted();
      return new FrameSource(
        input,
        new VideoSampleSink(track),
        file.name,
        frameIndex(points),
        width,
        height,
        (await track.getCodec()) ?? "video",
        file,
      );
    } catch (error) {
      input.dispose();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  async decode(index: number): Promise<HTMLCanvasElement> {
    if (this.image) return this.image;
    const point = this.frames[index];
    if (!point) throw new Error("Frame is outside this clip.");
    // Half a microsecond avoids float rounding below the indexed PTS. A
    // timestamp comparison below rejects any neighbouring decoded frame.
    const sample = await this.sink!.getSample(point.timestamp + 0.0000005);
    if (!sample) throw new Error("The selected frame could not be decoded.");
    try {
      if (Math.abs(sample.timestamp - point.timestamp) > 0.000002)
        throw new Error(
          "The decoder returned a different frame. Export is blocked.",
        );
      const canvas = document.createElement("canvas");
      canvas.width = sample.displayWidth;
      canvas.height = sample.displayHeight;
      const context = canvas.getContext("2d", { colorSpace: "srgb" });
      if (!context) throw new Error("Canvas is unavailable in this browser.");
      sample.draw(context, 0, 0);
      return canvas;
    } finally {
      sample.close();
    }
  }

  dispose() {
    this.input?.dispose();
  }
}
