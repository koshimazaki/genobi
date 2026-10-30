import { AUDIO_EXTENSION } from "../shared/music";

export function imageExtension(contentType?: string): string {
  return contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/webp"
      ? "webp"
      : "png";
}

/** A finished run's file name suffix: its still's type, its song's type, or MP4. */
export function resultExtension(job: {
  generator: string;
  resultContentType?: string;
}): string {
  if (job.generator === "image" || job.generator === "edit")
    return imageExtension(job.resultContentType);
  if (job.generator === "audio")
    return AUDIO_EXTENSION[job.resultContentType ?? ""] ?? "mp3";
  return "mp4";
}
