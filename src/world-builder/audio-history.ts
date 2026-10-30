/**
 * The Sound tab's recent audio: the last few tracks loaded here (a picked or
 * dropped file, audio the Comfy Inputs node sent, an agent's `setAudio`, the
 * example track once played),
 * kept in this browser's IndexedDB so they survive a reload
 * (`audio-recent-store.ts`), plus the project's own audio assets in the
 * studio. Nothing here is uploaded. A name is shown only in this list and
 * never enters the recipe.
 */
export type AudioSource =
  "file" | "drop" | "comfy" | "agent" | "project" | "take" | "example";

export interface RecentAudio {
  /** SHA-256 of the bytes, so the same track is listed once. */
  id: string;
  label: string;
  source: AudioSource;
  bytes: number;
  open(): Blob;
}

/** How many tracks the list keeps, and the bytes it may hold between them. */
export const RECENT_AUDIO = 6;
export const RECENT_AUDIO_BYTES = 96 * 1024 * 1024;

const fallback: Record<AudioSource, string> = {
  file: "Audio file",
  drop: "Dropped audio",
  comfy: "Comfy Inputs audio",
  agent: "Agent audio",
  project: "Project audio",
  take: "Take sound",
  example: "Example track",
};

/** A display name: control characters stripped, bounded, never empty. */
export function audioLabel(name: unknown, source: AudioSource) {
  const text =
    typeof name === "string"
      ? name.replace(/[\x00-\x1f\x7f]/g, "").trim() // eslint-disable-line no-control-regex
      : "";
  return text ? text.slice(0, 80) : fallback[source];
}

const audioExtension = /\.(wav|mp3|flac|ogg|oga|opus|m4a|aac|webm)$/i;
/** A dropped or picked file the decoder should try. Some drops carry no type. */
export function isAudioFile(file: { type: string; name?: string }) {
  if (file.type) return file.type.startsWith("audio/");
  return audioExtension.test(file.name ?? "");
}

/** A list already newest first, within the count and byte bounds; the rest
 *  are returned too, so storage can drop them. The newest always stays. */
export function boundRecent(list: RecentAudio[]) {
  const kept: RecentAudio[] = [];
  const evicted: RecentAudio[] = [];
  let bytes = 0;
  for (const item of list) {
    if (
      kept.length >= RECENT_AUDIO ||
      (kept.length && bytes + item.bytes > RECENT_AUDIO_BYTES)
    ) {
      evicted.push(item);
      continue;
    }
    kept.push(item);
    bytes += item.bytes;
  }
  return { kept, evicted };
}

/** Newest first, one entry per track, within the count and byte bounds. */
export function remember(list: RecentAudio[], entry: RecentAudio) {
  return boundRecent([entry, ...list.filter((item) => item.id !== entry.id)])
    .kept;
}

/** The drag type a recent-track row carries; its value is the track's id. */
export const RECENT_AUDIO_DRAG = "application/x-genobi-recent-audio";

/** The session's tracks first, then project audio not already listed. */
export function audioChoices(session: RecentAudio[], project: RecentAudio[]) {
  const seen = new Set(session.map((item) => item.id));
  return [
    ...session,
    ...project.filter((item) => !seen.has(item.id)).slice(0, RECENT_AUDIO),
  ];
}

/** The first audio file of a drop, or null when the drop holds none. */
export function droppedAudio(files: ArrayLike<File>) {
  return Array.from(files).find(isAudioFile) ?? null;
}
