import { isVideoSource, type Source } from "../../shared/types";
import { MAX_INPUT_BYTES } from "../../shared/mp4";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../../shared/director/types";
import { request } from "../useJobs";

const idPattern = /^[0-9a-f-]{36}$/;
export async function listSavedVideos(): Promise<Source[]> {
  const data = await request<{ sources: Source[] }>("/api/history");
  if (!Array.isArray(data.sources)) throw new Error("Invalid saved asset list");
  return data.sources.filter(
    (s) => s.origin !== "sample" && isVideoSource(s) && idPattern.test(s.id),
  );
}

/** IDs resolve only to the owned same-origin endpoint, never a supplied URL. */
export async function loadSavedVideo(source: Source): Promise<File> {
  if (!idPattern.test(source.id)) throw new Error("Invalid saved video ID");
  const response = await fetch(`/api/clips/${source.id}`, {
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error("This saved video is unavailable or has expired.");
  if (response.headers.get("content-type")?.split(";")[0] !== "video/mp4")
    throw new Error("Choose a saved MP4 video.");
  // A saved clip enters the project, so it takes the project's media limit
  // (upscaled results are larger than the 50 MB upload limit below).
  if (Number(response.headers.get("content-length")) > DIRECTOR_MEDIA_BYTES) {
    await response.body.cancel();
    throw new Error(`Director imports videos up to ${DIRECTOR_MEDIA_LIMIT}.`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DIRECTOR_MEDIA_BYTES)
        throw new Error(
          `Director imports videos up to ${DIRECTOR_MEDIA_LIMIT}.`,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new File(chunks, `${source.id}.mp4`, { type: "video/mp4" });
}

export class UploadOutcomeUnknownError extends Error {}

export async function saveVideo(blob: Blob, name: string, key: string) {
  if (!blob.size || blob.size > MAX_INPUT_BYTES)
    throw new Error("Save an MP4 under 50 MB.");
  const query = new URLSearchParams({ filename: `${name.slice(0, 90)}.mp4` });
  // One upload attempt; a lost response is reconciled by refreshing history.
  let response: Response;
  try {
    response = await fetch(`/api/uploads?${query}`, {
      cache: "no-store",
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        ...(key ? { "x-byo-key": key } : {}),
      },
      body: blob,
    });
  } catch (cause) {
    throw new UploadOutcomeUnknownError("Upload connection interrupted.", {
      cause,
    });
  }
  if (response.status >= 500)
    throw new UploadOutcomeUnknownError("Upload server error.");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Upload rejected.");
  }
  try {
    const data = await response.json();
    if (!data.source || !idPattern.test(data.source.id))
      throw new Error("Invalid upload receipt.");
    return data as { source: Source };
  } catch (cause) {
    throw new UploadOutcomeUnknownError("Upload receipt unavailable.", {
      cause,
    });
  }
}
