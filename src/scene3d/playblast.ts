/**
 * Render a playblast to MP4 in the browser. Frames come from the plate's
 * pure poses, one per grid frame, so no wall clock enters the clip; the
 * encoder is mediabunny over WebCodecs, as the Director's own MP4 export
 * (`src/director/export.ts`). The receipt, with the camera path in the
 * shared format, is written into the MP4's comment tag so it travels with
 * the asset into the Director and the project ZIP.
 */
import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import {
  writePlayblastReceipt,
  type PlayblastReceipt,
} from "../../shared/camera-path-playblast";
import type { CameraPathPose } from "../../shared/camera-path";
import type { ObjectPose } from "./gestures";
import type { Capture } from "./stage";

export interface PlayblastJob {
  receipt: PlayblastReceipt;
  title: string;
  capture: Capture;
  /** Pose of frame `i`; the job renders frames 0..frames-1. */
  frame(i: number): { pose: CameraPathPose; object: ObjectPose };
  signal: AbortSignal;
  onFrame(done: number): void;
}

/** H.264 first, for Comfy and players; VP9 and AV1 in MP4 where it is absent. */
const CODECS = ["avc", "vp9", "av1"] as const;

export async function renderPlayblast(job: PlayblastJob): Promise<Blob> {
  const { receipt, capture, signal } = job;
  const { width, height, fps, frames } = receipt;
  const comment = writePlayblastReceipt(receipt);
  const quality = new Quality({ bitrate: 6_000_000 });
  const codec = await getFirstEncodableVideoCodec([...CODECS], {
    width,
    height,
    quality,
  });
  if (!codec)
    throw new Error(
      "This browser cannot encode video. Use current Chrome or Edge.",
    );
  signal.throwIfAborted();
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const video = new CanvasSource(capture.canvas, {
    codec,
    quality,
    keyFrameInterval: 1,
    latencyMode: "quality",
  });
  output.addVideoTrack(video, { frameRate: fps });
  output.setMetadataTags({ title: job.title, comment });
  try {
    await output.start();
    for (let i = 0; i < frames; i++) {
      signal.throwIfAborted();
      const { pose, object } = job.frame(i);
      capture.render(pose, object, i / fps);
      await video.add(i / fps, 1 / fps);
      job.onFrame(i + 1);
      // Let the progress bar paint and a cancel land, without a rAF clock.
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    video.close();
    await output.finalize();
    // A cancel during the last frame or finalisation still wins.
    signal.throwIfAborted();
    if (!target.buffer) throw new Error("The encoder returned no video.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized") await output.cancel();
    throw error;
  }
}
