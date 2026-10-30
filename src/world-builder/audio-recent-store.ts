/**
 * Recent tracks kept across reloads: the Sound tab's history in this
 * browser's IndexedDB, bounded like the list itself (`RECENT_AUDIO` tracks,
 * `RECENT_AUDIO_BYTES`), the oldest dropped first. Nothing is uploaded, and a
 * track's name lives only here, never in a recipe. Project audio is not
 * stored: the open project already holds it. Without storage (a private
 * window, blocked site data) the list still works for the tab.
 */
import {
  audioLabel,
  boundRecent,
  type AudioSource,
  type RecentAudio,
} from "./audio-history";

/** One stored track: the list entry plus its bytes and when it was last used. */
export interface StoredAudio {
  id: string;
  label: string;
  source: Exclude<AudioSource, "project">;
  bytes: number;
  usedAt: number;
  blob: Blob;
}

/** Where tracks are kept. Every method may reject; the store copes. */
export interface AudioBackend {
  all(): Promise<StoredAudio[]>;
  put(row: StoredAudio): Promise<void>;
  delete(id: string): Promise<void>;
}

const sources = new Set(["file", "drop", "comfy", "agent", "take", "example"]);
/** A stored row read back: the shape it must have before it is listed. */
function isStored(row: unknown): row is StoredAudio {
  const v = row as Partial<StoredAudio> | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    /^[0-9a-f]{64}$/.test(v.id) &&
    typeof v.label === "string" &&
    typeof v.source === "string" &&
    sources.has(v.source) &&
    typeof v.usedAt === "number" &&
    v.blob instanceof Blob
  );
}

const entry = (row: StoredAudio): RecentAudio => ({
  id: row.id,
  // Re-sanitised: a stored name is shown, so it gets the same rules.
  label: audioLabel(row.label, row.source),
  source: row.source,
  bytes: row.blob.size,
  open: () => row.blob,
});

export function createRecentAudio(backend: AudioBackend) {
  let list: RecentAudio[] = [];
  /** False once storage failed: the list then lasts only for this tab. */
  let persisted = true;
  const fail = () => {
    persisted = false;
  };
  /** Mutations run one at a time: an add evicting another's track must not
   *  interleave with that track's write, or storage outgrows the bounds. */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => {
    const next = queue.then(work);
    queue = next.catch(() => {});
    return next;
  };
  async function drop(items: RecentAudio[]) {
    for (const item of items) {
      if (item.source !== "project") await backend.delete(item.id).catch(fail);
    }
  }
  return {
    /** Restore the stored tracks behind anything added before they arrived. */
    load: () =>
      serial(async () => {
        let rows: unknown[] = [];
        try {
          rows = await backend.all();
        } catch {
          fail();
        }
        const stored = rows
          .filter(isStored)
          .filter((row) => !list.some((item) => item.id === row.id))
          .sort((a, b) => b.usedAt - a.usedAt);
        const { kept, evicted } = boundRecent([...list, ...stored.map(entry)]);
        list = kept;
        await drop(evicted);
        return list;
      }),
    /** List a track as the newest, and keep it unless it is project audio. */
    add: (item: RecentAudio, now = Date.now()) =>
      serial(async () => {
        const { kept, evicted } = boundRecent([
          item,
          ...list.filter((other) => other.id !== item.id),
        ]);
        list = kept;
        await drop(evicted);
        if (item.source !== "project" && kept.includes(item))
          await backend
            .put({
              id: item.id,
              label: item.label,
              source: item.source,
              bytes: item.bytes,
              usedAt: now,
              blob: item.open(),
            })
            .catch(fail);
        return list;
      }),
    /** Forget one track here and in storage. */
    forget: (id: string) =>
      serial(async () => {
        const gone = list.filter((item) => item.id === id);
        list = list.filter((item) => item.id !== id);
        await drop(gone);
        return list;
      }),
    list: () => list,
    persisted: () => persisted,
  };
}
export type RecentAudioStore = ReturnType<typeof createRecentAudio>;

/** A backend that keeps nothing past the tab: tests, and no IndexedDB. */
export function memoryAudioBackend(
  map = new Map<string, StoredAudio>(),
): AudioBackend {
  return {
    all: async () => [...map.values()],
    put: async (row) => void map.set(row.id, row),
    delete: async (id) => void map.delete(id),
  };
}

const DB = "genobi-world-audio",
  STORE = "tracks";
/** IndexedDB in this browser, or a rejecting backend when there is none. */
export function indexedDbAudioBackend(factory?: IDBFactory): AudioBackend {
  let db: Promise<IDBDatabase> | undefined;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const idb = factory ?? globalThis.indexedDB;
      if (!idb) return reject(new Error("No IndexedDB in this browser."));
      const request = idb.open(DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Audio storage blocked."));
    }).catch((e) => {
      db = undefined;
      throw e;
    }));
  async function run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Storage aborted."));
    });
  }
  return {
    all: () => run("readonly", (s) => s.getAll() as IDBRequest<StoredAudio[]>),
    put: async (row) => void (await run("readwrite", (s) => s.put(row))),
    delete: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}
