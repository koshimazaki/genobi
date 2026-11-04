import { useSyncExternalStore } from "react";
import { setActivity } from "../busy";
import { progressLine } from "../../shared/progress-line";

/**
 * Template media downloads with their progress counted as the bytes arrive.
 * Opening a mix template fetches every clip and the track in full before the
 * Editor can show it (tens of megabytes), so the load reports itself twice:
 * as an activity line beside the wordmark, through `busy.ts`
 * (`LOADING ACOUSTIC SPACES V2  36% ⣿⣿⣀⣀  24 / 66 MB`), and as a snapshot
 * the stage status reads (`useMediaLoad`). The bytes returned are exactly the
 * bytes fetched; digests and validation stay with the caller.
 */
export interface MediaLoad {
  /** The template or showcase being opened, as it is named. */
  name: string;
  files: number;
  doneBytes: number;
  /** Undefined when a response did not say its length. */
  totalBytes?: number;
}

const MB = 1024 * 1024;
const BAR_CELLS = 4;
const loads = new Map<string, MediaLoad>();
let current: MediaLoad | undefined;
const listeners = new Set<() => void>();
let serial = 0;

function publish() {
  current = [...loads.values()].at(-1);
  listeners.forEach((listener) => listener());
}

const fraction = (load: MediaLoad) =>
  load.totalBytes ? Math.min(1, load.doneBytes / load.totalBytes) : undefined;
const megabytes = (bytes: number) => Math.round(bytes / MB);

/** The wordmark's line: the name, then percent and bar, then MB when known. */
export function mediaLoadLine(load: MediaLoad): string {
  const stage = `LOADING ${load.name.toUpperCase()}`;
  const f = fraction(load);
  if (f === undefined) return stage;
  return `${progressLine(stage, f, undefined, BAR_CELLS)}  ${megabytes(load.doneBytes)} / ${megabytes(load.totalBytes!)} MB`;
}

/** The stage's words: `Loading 9 files · 24 of 66 MB`. */
export function mediaLoadStatus(load: MediaLoad): string {
  const files = `Loading ${load.files} ${load.files === 1 ? "file" : "files"}`;
  return load.totalBytes
    ? `${files} · ${megabytes(load.doneBytes)} of ${megabytes(load.totalBytes)} MB`
    : `${files} · ${megabytes(load.doneBytes)} MB`;
}

async function readCounted(
  response: Response,
  onBytes: (count: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onBytes(bytes.byteLength);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onBytes(value.byteLength);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Fetches every URL in parallel and returns their bytes in the same order,
 * reporting overall progress under `name`. The total comes from the
 * `Content-Length` headers when every response sends one; otherwise the load
 * is indeterminate. The activity is always cleared, failed or not, and one
 * failure aborts the rest.
 */
export async function fetchMediaFiles(
  name: string,
  urls: readonly string[],
  error = "Template media unavailable",
): Promise<Uint8Array<ArrayBuffer>[]> {
  const id = `template-media-${++serial}`;
  const load: MediaLoad = { name, files: urls.length, doneBytes: 0 };
  let shown = "";
  // Set once the batch settles: a reader still streaming after another file
  // failed must not publish the load again with nothing left to clear it.
  let closed = false;
  const controller = new AbortController();
  const report = () => {
    if (closed) return;
    const line = mediaLoadLine(load);
    const key = `${line}|${mediaLoadStatus(load)}`;
    // Only a change a person can see re-renders the header and the stage.
    if (key === shown) return;
    shown = key;
    loads.set(id, { ...load });
    setActivity(id, line);
    publish();
  };
  try {
    report();
    // Each body is read in its own fetch's continuation. Waiting for every
    // header first would hold HTTP/1.1's six connections per origin with
    // unread bodies while the seventh request never starts: a deadlock.
    const lengths: number[] = urls.map(() => NaN);
    let headersSeen = 0;
    return await Promise.all(
      urls.map(async (url, i) => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(error);
        lengths[i] = Number(response.headers.get("Content-Length") ?? NaN);
        // Indeterminate until every file has said its length.
        if (
          ++headersSeen === urls.length &&
          lengths.every((n) => Number.isFinite(n) && n > 0)
        ) {
          load.totalBytes = lengths.reduce((a, b) => a + b, 0);
          report();
        }
        return readCounted(response, (count) => {
          load.doneBytes += count;
          report();
        });
      }),
    );
  } catch (e) {
    // One failure fails the batch, so the other downloads stop spending
    // bandwidth; their readers reject on the aborted bodies.
    controller.abort();
    throw e;
  } finally {
    closed = true;
    loads.delete(id);
    setActivity(id, undefined);
    publish();
  }
}

/** One file through `fetchMediaFiles`. */
export const fetchMediaFile = async (name: string, url: string) =>
  (await fetchMediaFiles(name, [url]))[0];

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The newest template media load in flight, if any. */
export const mediaLoadNow = () => current;

/** `mediaLoadNow`, kept current; the server render loads nothing. */
export function useMediaLoad(): MediaLoad | undefined {
  return useSyncExternalStore(subscribe, mediaLoadNow, () => undefined);
}

/**
 * Reads an activity line back into what the wordmark draws: the stage before
 * the percent (`LOADING ACOUSTIC SPACES V2`) and the percent, when the line
 * carries one. Any activity line works, so a job with real progress shows too.
 */
export function parseActivityLine(line: string): {
  label: string;
  percent?: number;
} {
  const match = /^(.*?)\s{2}(\d{1,3})%/.exec(line);
  if (match) return { label: match[1], percent: Number(match[2]) };
  return { label: line.split(/\s{2}/)[0] };
}

/** Whether an activity id belongs to a template media load. */
export const isMediaActivity = (id: string) => id.startsWith("template-media");
