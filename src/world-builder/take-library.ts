/**
 * The scene library's takes: every capture and live recording of this
 * browser, newest first, kept in IndexedDB so they survive a reload. Bounded
 * to 20 takes and 500 MB; the oldest go first. Nothing here uploads: a take
 * leaves the browser only when someone adds or sends it. Without storage
 * (private window, blocked site data) the library still works for the tab.
 */
import type { Take } from "./export-take";
import { validateRecipe, type Recipe } from "./recipe";

export const LIBRARY_LIMITS = { takes: 20, bytes: 500 * 1024 * 1024 };

export interface LibraryTake {
  id: string;
  name: string;
  createdAt: number;
  mode: "fixed" | "live";
  seconds: number;
  /** Frame count of a fixed take; a live recording has none. */
  frames: number | null;
  width: number;
  height: number;
  /** Every blob together, what the bound counts. */
  bytes: number;
  video: Blob;
  first: Blob;
  manifest: Blob;
  audio?: Blob;
  depth?: Blob;
  depthFirst?: Blob;
  /** The recipe the receipt recorded, when it still validates. */
  recipe: Recipe | null;
}

/** Where the takes are kept. Every method may reject; the library copes. */
export interface TakeBackend {
  all(): Promise<LibraryTake[]>;
  put(take: LibraryTake): Promise<void>;
  delete(id: string): Promise<void>;
}

const blobs = (t: Take | LibraryTake) =>
  [t.video, t.first, t.manifest, t.audio, t.depth, t.depthFirst].filter(
    (b): b is Blob => !!b,
  );

/** A captured take as a library entry, read from its own receipt. */
export async function libraryEntry(
  take: Take,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): Promise<LibraryTake> {
  let receipt: Record<string, unknown> = {};
  try {
    receipt = JSON.parse(await take.manifest.text());
  } catch {
    // A receipt that does not parse leaves the entry without a recipe.
  }
  const recipe = revalidate(receipt.recipe);
  const live = take.mode === "live";
  const frames =
    !live && typeof receipt.frameCount === "number" ? receipt.frameCount : null;
  const seconds =
    typeof receipt.duration === "number"
      ? receipt.duration
      : frames
        ? frames / 24
        : 0;
  return {
    id,
    name: take.name,
    createdAt: now,
    mode: live ? "live" : "fixed",
    seconds,
    frames,
    width: recipe?.width ?? 0,
    height: recipe?.height ?? 0,
    bytes: blobs(take).reduce((n, b) => n + b.size, 0),
    video: take.video,
    first: take.first,
    manifest: take.manifest,
    ...(take.audio && { audio: take.audio }),
    ...(take.depth && { depth: take.depth }),
    ...(take.depthFirst && { depthFirst: take.depthFirst }),
    recipe,
  };
}

/** Back to the shape the capture actions take. */
export const asTake = (t: LibraryTake): Take => ({
  ...(t.mode === "live" && { mode: "live" as const }),
  name: t.name,
  video: t.video,
  first: t.first,
  manifest: t.manifest,
  ...(t.audio && { audio: t.audio }),
  ...(t.depth && { depth: t.depth }),
  ...(t.depthFirst && { depthFirst: t.depthFirst }),
});

/** Newest first, within both bounds; the rest are returned to delete. */
export function bound(list: LibraryTake[], limits = LIBRARY_LIMITS) {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  const keep: LibraryTake[] = [];
  const evicted: LibraryTake[] = [];
  let bytes = 0;
  for (const take of sorted) {
    if (keep.length < limits.takes && bytes + take.bytes <= limits.bytes) {
      keep.push(take);
      bytes += take.bytes;
    } else evicted.push(take);
  }
  return { keep, evicted };
}

/** A stored row read back: the shape it must have before it is shown. */
function isStoredTake(t: unknown): t is LibraryTake {
  const v = t as Partial<LibraryTake> | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.bytes === "number" &&
    (v.mode === "fixed" || v.mode === "live") &&
    v.video instanceof Blob &&
    v.first instanceof Blob &&
    v.manifest instanceof Blob
  );
}
function revalidate(recipe: unknown) {
  try {
    return recipe ? validateRecipe(recipe) : null;
  } catch {
    return null;
  }
}

export function createTakeLibrary(
  backend: TakeBackend,
  limits = LIBRARY_LIMITS,
) {
  let takes: LibraryTake[] = [];
  /** False once a write failed: the takes then last only for this tab. */
  let persisted = true;
  async function drop(list: LibraryTake[]) {
    for (const take of list)
      await backend.delete(take.id).catch(() => {
        persisted = false;
      });
  }
  return {
    async load() {
      let stored: LibraryTake[] = [];
      try {
        stored = await backend.all();
      } catch {
        persisted = false;
      }
      const restored = stored.filter(isStoredTake).map((t) => ({
        ...t,
        recipe: revalidate(t.recipe),
      }));
      const { keep, evicted } = bound(
        [
          ...takes,
          ...restored.filter((s) => !takes.some((t) => t.id === s.id)),
        ],
        limits,
      );
      takes = keep;
      await drop(evicted);
      return takes;
    },
    async append(take: Take, now = Date.now()) {
      const entry = await libraryEntry(take, now);
      const { keep, evicted } = bound([entry, ...takes], limits);
      takes = keep;
      await drop(evicted);
      if (keep.includes(entry))
        await backend.put(entry).catch(() => {
          persisted = false;
        });
      return { entry, takes, evicted };
    },
    async remove(id: string) {
      takes = takes.filter((t) => t.id !== id);
      await backend.delete(id).catch(() => {
        persisted = false;
      });
      return takes;
    },
    list: () => takes,
    persisted: () => persisted,
  };
}
export type TakeLibrary = ReturnType<typeof createTakeLibrary>;

/** A backend that keeps nothing past the tab: tests, and no IndexedDB. */
export function memoryBackend(
  map = new Map<string, LibraryTake>(),
): TakeBackend {
  return {
    all: async () => [...map.values()],
    put: async (t) => void map.set(t.id, t),
    delete: async (id) => void map.delete(id),
  };
}

const DB = "genobi-world-library",
  STORE = "takes";
/** IndexedDB in this browser, or a rejecting backend when there is none. */
export function indexedDbBackend(factory?: IDBFactory): TakeBackend {
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
      request.onblocked = () => reject(new Error("Library storage blocked."));
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
    all: () => run("readonly", (s) => s.getAll() as IDBRequest<LibraryTake[]>),
    put: async (take) => void (await run("readwrite", (s) => s.put(take))),
    delete: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}
