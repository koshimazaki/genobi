import { withBrowserActivity } from "../activity/store";
import { validateRecipe, type Recipe } from "./recipe";
import { makeWebm, type EncodedFrame } from "./webm";
import { sceneCaptureInfo } from "./scene-capture";
export interface CaptureRenderer {
  renderFrame(frame: number): HTMLCanvasElement | Promise<HTMLCanvasElement>;
  /** Optional linear depth pass over the same camera path and frame grid. */
  renderDepthFrame?(frame: number): Promise<HTMLCanvasElement>;
  appearance?(): Record<string, string> | undefined;
}
export function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG capture failed.")),
      "image/png",
    ),
  );
}
export interface Take {
  mode?: "live";
  video: Blob;
  audio?: Blob;
  first: Blob;
  /** Depth pass WebM and its first frame, when the renderer provides one. */
  depth?: Blob;
  depthFirst?: Blob;
  manifest: Blob;
  name: string;
}
export const hash = async (blob: Blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
/** One VP8 stream on the take's frame grid, with the 128 MB bound. */
function videoTrack(config: VideoEncoderConfig) {
  const chunks: EncodedFrame[] = [];
  let error: Error | null = null;
  let byteCount = 0;
  const encoder = new VideoEncoder({
    output(chunk) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      byteCount += data.length;
      if (byteCount > 128 * 1024 * 1024) {
        error = new Error("Take exceeded the 128 MB capture limit.");
        return;
      }
      chunks.push({
        timestamp: chunk.timestamp,
        key: chunk.type === "key",
        data,
      });
    },
    error(e) {
      error = e;
    },
  });
  encoder.configure(config);
  const fps = config.framerate!;
  return {
    async add(canvas: HTMLCanvasElement, i: number) {
      if (error) throw error;
      const timestamp = Math.round((i * 1e6) / fps);
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: Math.round(((i + 1) * 1e6) / fps) - timestamp,
      });
      try {
        encoder.encode(frame, { keyFrame: i % fps === 0 });
      } finally {
        frame.close();
      }
      // Backpressure bounds memory and yields for cancellation without using wall time as the video clock.
      await encoder.flush();
    },
    finish(frames: number) {
      if (error) throw error;
      chunks.sort((a, b) => a.timestamp - b.timestamp);
      if (
        chunks.length !== frames ||
        chunks.some((c, i) => c.timestamp !== Math.round((i * 1e6) / fps))
      )
        throw new Error(
          "Encoder output did not match the requested frame grid.",
        );
      return makeWebm(chunks, config.width, config.height, fps);
    },
    close() {
      if (encoder.state !== "closed") encoder.close();
    },
  };
}
async function exportTakeImpl(
  input: Recipe,
  renderer: CaptureRenderer,
  signal: AbortSignal,
  progress: (n: number) => void,
  /** The take's name, as an agent's capture gives it; else scene and time. */
  named?: string,
): Promise<Take> {
  const recipe = validateRecipe(input);
  if (!("VideoEncoder" in window))
    throw new Error(
      "Exact video export needs a browser with WebCodecs (Chrome/Edge). PNG still export remains available.",
    );
  const config: VideoEncoderConfig = {
    codec: "vp8",
    width: recipe.width,
    height: recipe.height,
    framerate: recipe.fps,
    bitrate: 12_000_000,
    latencyMode: "realtime",
  };
  if (!(await VideoEncoder.isConfigSupported(config)).supported)
    throw new Error(
      "VP8 encoding is unavailable at this size. Try a smaller size or Chrome.",
    );
  const depthFrame = renderer.renderDepthFrame?.bind(renderer);
  const colour = videoTrack(config);
  const depth = depthFrame ? videoTrack(config) : null;
  let first: Blob | null = null,
    depthFirst: Blob | null = null;
  try {
    for (let i = 0; i < recipe.frames; i++) {
      signal.throwIfAborted();
      const canvas = await renderer.renderFrame(i);
      if (canvas.width !== recipe.width || canvas.height !== recipe.height)
        throw new Error("Capture buffer size changed during export.");
      if (i === 0) first = await png(canvas);
      await colour.add(canvas, i);
      if (depth && depthFrame) {
        const pass = await depthFrame(i);
        if (i === 0) depthFirst = await png(pass);
        await depth.add(pass, i);
      }
      if (i % 8 === 0 || i === recipe.frames - 1) progress(i + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    const video = colour.finish(recipe.frames);
    const depthVideo = depth?.finish(recipe.frames);
    if (!first || (depth && !depthFirst))
      throw new Error("Encoder output did not match the requested frame grid.");
    const name =
      named ??
      `${recipe.scene}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const manifest = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            recipe,
            ...(recipe.motion
              ? { sceneEvaluation: await sceneCaptureInfo(recipe) }
              : {}),
            appearance: renderer.appearance?.(),
            frameCount: recipe.frames,
            duration: recipe.frames / recipe.fps,
            ltxTiming: {
              numFrames: recipe.frames,
              frameRate: recipe.fps,
              temporalMultiple: 8,
              temporalOffset: 1,
              lastSampleSeconds: (recipe.frames - 1) / recipe.fps,
            },
            timebase: "frame / fps",
            colour: "browser SDR",
            passes: depthVideo ? ["colour", "depth"] : ["colour"],
            ...(depthVideo && {
              depth: {
                video: `${name}-depth.webm`,
                firstFrame: `${name}-depth.png`,
                encoding:
                  "linear camera distance, 1 at depthNear to 0 at depthFar, greyscale",
                near: recipe.depthNear,
                far: recipe.depthFar,
              },
            }),
            audio: false,
            worldMotion:
              "fixed frame camera, object and audio-envelope animation",
            firstFrame: `${name}.png`,
            video: `${name}.webm`,
            sha256: {
              first: await hash(first),
              video: await hash(video),
              ...(depthVideo &&
                depthFirst && {
                  depth: await hash(depthVideo),
                  depthFirst: await hash(depthFirst),
                }),
            },
            intendedRoutes: {
              image: "FLUX Klein",
              video: "LTX Layout-to-Render",
            },
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    return {
      name,
      first,
      video,
      manifest,
      ...(depthVideo && depthFirst && { depth: depthVideo, depthFirst }),
    };
  } finally {
    colour.close();
    depth?.close();
    await renderer.renderFrame(0);
  }
}

export const exportTake = (...args: Parameters<typeof exportTakeImpl>) =>
  withBrowserActivity("scene", () => exportTakeImpl(...args));
