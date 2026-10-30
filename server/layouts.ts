import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  layoutId,
  layoutsFile,
  MAX_LAYOUTS_FILE_BYTES,
  parseLayoutInput,
  readSavedLayouts,
  removeLayout,
  upsertLayout,
  type SavedLayout,
} from "../shared/saved-layouts";

/**
 * Saved studio layouts for this machine, in `layouts.json` beside the job
 * store and `voice.json`. They belong to the machine, not a browser session,
 * so every browser on it sees the same list and a restart keeps them. A
 * corrupt or oversized file reads as no layouts and is replaced on the next
 * save; one bad entry is dropped, not the file.
 */
export class LocalLayouts {
  private layouts?: SavedLayout[];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  constructor(directory: string) {
    this.file = path.join(directory, "layouts.json");
  }

  async list(): Promise<SavedLayout[]> {
    if (this.layouts) return this.layouts;
    let layouts: SavedLayout[] = [];
    try {
      const text = await readFile(this.file, "utf8");
      if (text.length <= MAX_LAYOUTS_FILE_BYTES)
        layouts = readSavedLayouts(JSON.parse(text));
    } catch {
      layouts = [];
    }
    // A save that finished while this read was pending wins.
    return (this.layouts ??= layouts);
  }

  async save(id: unknown, body: unknown) {
    const saved = parseLayoutInput(id, body, new Date().toISOString());
    return this.change((list) => upsertLayout(list, saved));
  }

  async remove(id: unknown) {
    const target = layoutId(id);
    return this.change((list) => removeLayout(list, target));
  }

  /**
   * One read, change and write at a time: each change reads the list the
   * previous one wrote, so overlapping saves and deletes never drop each
   * other. A refused change leaves the list and the queue as they were.
   */
  private change(edit: (list: SavedLayout[]) => SavedLayout[]) {
    const run = this.queue
      .catch(() => {})
      .then(async () => {
        const next = edit(await this.list());
        const snapshot = JSON.stringify(layoutsFile(next), null, 2);
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, this.file);
        this.layouts = next;
        return next;
      });
    this.queue = run;
    return run;
  }
}
