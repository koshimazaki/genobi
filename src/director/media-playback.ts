/**
 * Project media previews: one plays at a time, files load only when asked,
 * and every object URL is revoked. A tile claims playback before it plays;
 * the claim pauses whatever played before, whose own `pause` handler then
 * puts that tile back to its poster.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

let playing: HTMLMediaElement | null = null;

/** Make `media` the only preview playing, pausing the previous one. */
export function claimPlayback(media: HTMLMediaElement) {
  const previous = playing;
  playing = media;
  if (previous && previous !== media) previous.pause();
}

/** Forget `media` as the playing preview, if it is. */
export function releasePlayback(media: HTMLMediaElement) {
  if (playing === media) playing = null;
}

/** Pause whatever preview is playing: the drawer or rail closed. */
export function stopPlayback() {
  const media = playing;
  playing = null;
  media?.pause();
}

/** Pause, detach and forget a preview element, so its file is let go. */
export function releaseMedia(media: HTMLMediaElement | null) {
  if (!media) return;
  releasePlayback(media);
  media.pause();
  media.removeAttribute("src");
  try {
    media.load();
  } catch {
    // jsdom and some older engines do not implement load(); nothing to free.
  }
}

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(change: () => void) {
  if (typeof matchMedia !== "function") return () => {};
  const list = matchMedia(QUERY);
  list.addEventListener?.("change", change);
  return () => list.removeEventListener?.("change", change);
}
const reducedNow = () =>
  typeof matchMedia === "function" && matchMedia(QUERY).matches;

/** True when the person asked for less motion: no video starts on hover. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, reducedNow, () => false);
}

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The type a stored file plays as, from its extension. */
export function mediaType(path: string) {
  return TYPES[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "";
}

// One Blob per file and type, so each hover does not copy the file again.
const blobs = new WeakMap<Uint8Array, Map<string, Blob>>();
function blobOf(bytes: Uint8Array<ArrayBuffer>, type: string) {
  let byType = blobs.get(bytes);
  if (!byType) blobs.set(bytes, (byType = new Map()));
  let blob = byType.get(type);
  if (!blob) byType.set(type, (blob = new Blob([bytes], { type })));
  return blob;
}

/**
 * An object URL for `bytes`, made only while `enabled` and revoked when it
 * turns off, the bytes change or the component unmounts.
 */
export function useObjectUrl(
  bytes: Uint8Array<ArrayBuffer> | undefined,
  enabled: boolean,
  type = "",
) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!enabled || !bytes) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(blobOf(bytes, type));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes, enabled, type]);
  return enabled && bytes ? url : "";
}
