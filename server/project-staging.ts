// Files uploaded for a manifest that has not been pushed yet. A push that is
// refused (another window or an agent wrote first) never lands, so its files
// are reclaimed at once; files whose push never came are reclaimed once they
// are older than STAGE_MS. Neither touches a file the current copy names.
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pruneFiles } from "./project-bundle";

export const STAGE_MS = 10 * 60_000;

export class Staging {
  /** Per copy's files directory: staged SHA-256 → when it was staged. */
  private batches = new Map<string, Map<string, number>>();
  constructor(private clock: () => number = Date.now) {}

  add(files: string, sha256: string) {
    const batch = this.batches.get(files) ?? new Map<string, number>();
    batch.set(sha256, this.clock());
    this.batches.set(files, batch);
  }

  /** Remove staged files older than STAGE_MS that `keep` does not name. */
  async expire(files: string, keep: Set<string>) {
    const batch = this.batches.get(files);
    if (!batch) return;
    const cutoff = this.clock() - STAGE_MS;
    for (const [sha, at] of batch)
      if (at < cutoff) {
        batch.delete(sha);
        if (!keep.has(sha)) await rm(path.join(files, sha), { force: true });
      }
  }

  /**
   * Remove the project directories under `owner` that hold no copy (`keep`
   * says which do) and had nothing staged within STAGE_MS: first uploads
   * whose manifest never came. Returns the directories left.
   */
  async sweep(owner: string, keep: (id: string) => boolean) {
    const left: string[] = [];
    for (const id of await readdir(owner).catch(() => [] as string[])) {
      const files = path.join(owner, id, "files");
      const batch = this.batches.get(files);
      const newest = batch ? Math.max(0, ...batch.values()) : 0;
      if (keep(id) || newest >= this.clock() - STAGE_MS) left.push(id);
      else {
        await rm(path.join(owner, id), { recursive: true, force: true });
        this.batches.delete(files);
      }
    }
    return left;
  }

  /** A push was refused or landed: whatever it staged and lost goes. */
  async reclaim(files: string, keep: Set<string>) {
    this.batches.delete(files);
    await pruneFiles(files, keep);
  }
}
