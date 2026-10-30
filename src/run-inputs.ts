import type { GenerateInput, Job } from "../shared/types";
import { isImage, isKlein } from "../shared/image";
import { imagePrompt, type ImageRegion } from "./image-regions";
import { checkRunInputs } from "./run-inputs-check";
import type { ComposerState } from "./useComposer";

/** Private browser inputs, separate from public jobs and replay fingerprints. */
export interface RunInputs {
  id: string;
  savedAt: number;
  bytes: number;
  generator: GenerateInput["generator"];
  model: GenerateInput["model"];
  description: string;
  sentDescription: string;
  imageReferences: string[];
  imageRegions: ImageRegion[];
}
const STORE = "runs";
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_RUNS = 50;
const RETENTION = 30 * 24 * 60 * 60 * 1000;

export function captureRunInputs(
  job: Job,
  input: GenerateInput,
  composer?: ComposerState,
): RunInputs {
  const regions = isKlein(input.model) ? (composer?.imageRegions ?? []) : [];
  const editable =
    composer &&
    isImage(input.generator) &&
    composer.generator === input.generator &&
    composer.model === input.model &&
    imagePrompt(composer.description, regions, input.generator === "edit") ===
      input.description;
  const value = {
    id: job.id,
    savedAt: Date.now(),
    generator: job.generator,
    model: job.model,
    description: editable ? composer.description : job.description,
    sentDescription: job.description,
    imageReferences: [...(input.imageReferences ?? [])],
    imageRegions: editable ? structuredClone(regions) : [],
  };
  return { ...value, bytes: JSON.stringify(value).length * 2 };
}

export function restoredRunInputs(
  job: Job,
  stored?: RunInputs,
): Partial<ComposerState> {
  // Revalidated here too: the composer is the boundary, whatever the source.
  const inputs = checkRunInputs(stored);
  if (
    !inputs ||
    inputs.id !== job.id ||
    inputs.generator !== job.generator ||
    inputs.model !== job.model ||
    inputs.sentDescription !== job.description
  )
    return {};
  return {
    ...(isImage(job.generator) ? { description: inputs.description } : {}),
    imageReferences: inputs.imageReferences,
    imageRegions: inputs.imageRegions,
  };
}

/** Memory survives a blocked database for this tab; successful writes survive reload. */
export function createRunInputStore(
  factory: () => IDBFactory | undefined = () => globalThis.indexedDB,
) {
  const memory = new Map<string, RunInputs>();
  let database: Promise<IDBDatabase> | undefined;
  const open = () =>
    (database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const idb = factory();
      if (!idb) return reject(new Error("Browser input storage unavailable."));
      const request = idb.open("genobi-run-inputs", 1);
      request.onupgradeneeded = () =>
        request.result
          .createObjectStore(STORE, { keyPath: "id" })
          .createIndex("savedAt", "savedAt");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Browser input storage blocked."));
    }).catch((error) => {
      database = undefined;
      throw error;
    }));
  const pruneMemory = () => {
    let bytes = 0,
      count = 0;
    for (const row of [...memory.values()].sort(
      (a, b) => b.savedAt - a.savedAt,
    )) {
      bytes += row.bytes;
      if (
        ++count > MAX_RUNS ||
        bytes > MAX_BYTES ||
        row.savedAt < Date.now() - RETENTION
      )
        memory.delete(row.id);
    }
  };
  return {
    async save(row: RunInputs): Promise<boolean> {
      memory.set(row.id, structuredClone(row));
      pruneMemory();
      try {
        const db = await open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite"),
            store = tx.objectStore(STORE);
          store.put(row);
          // Newest inputs first; trim in the same transaction as the write.
          const cursor = store.index("savedAt").openCursor(null, "prev");
          let bytes = 0,
            count = 0;
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            const value = item.value as RunInputs;
            bytes += value.bytes;
            if (
              ++count > MAX_RUNS ||
              bytes > MAX_BYTES ||
              value.savedAt < Date.now() - RETENTION
            )
              item.delete();
            item.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        return true;
      } catch {
        return false;
      }
    },
    async load(id: string): Promise<RunInputs | undefined> {
      pruneMemory();
      if (memory.has(id)) return structuredClone(memory.get(id));
      try {
        const db = await open();
        return await new Promise<RunInputs | undefined>((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite"),
            store = tx.objectStore(STORE),
            request = store.get(id);
          // Expired inputs leave browser storage on read too, not only on the next save.
          const expired = store
            .index("savedAt")
            .openCursor(IDBKeyRange.upperBound(Date.now() - RETENTION, true));
          expired.onsuccess = () => {
            const item = expired.result;
            if (!item) return;
            item.delete();
            item.continue();
          };
          tx.oncomplete = () => {
            const row = checkRunInputs(request.result);
            resolve(
              row && row.savedAt >= Date.now() - RETENTION ? row : undefined,
            );
          };
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } catch {
        return undefined;
      }
    },
  };
}
export const runInputStore = createRunInputStore();
