import type { Source } from "../shared/types";
import { request } from "./useJobs";

/**
 * Upload an MP4 as a video source, as the Upscale drop zone does
 * (`SourceInput`): the browser reads its size and length, and the server's
 * MP4 reader establishes them again before storing it. Not a generation.
 * `refresh` reloads the source list, so Upscale can show the new source.
 */
export async function uploadVideoSource(
  file: File,
  apiKey: string,
  refresh?: () => Promise<unknown> | void,
) {
  if (file.size > 50_000_000 || !file.name.toLowerCase().endsWith(".mp4"))
    throw new Error("Choose an MP4 file under 50 MB.");
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Could not read video metadata.")),
        5000,
      );
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("This video cannot be read."));
      };
      video.src = url;
    });
    const query = new URLSearchParams({
      filename: file.name,
      width: String(video.videoWidth),
      height: String(video.videoHeight),
      duration: String(video.duration),
    });
    const { source } = await request<{ source: Source }>(
      `/api/uploads?${query}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "video/mp4",
          ...(apiKey ? { "x-byo-key": apiKey } : {}),
        },
        body: file,
      },
    );
    await refresh?.();
    return source;
  } finally {
    URL.revokeObjectURL(url);
  }
}
