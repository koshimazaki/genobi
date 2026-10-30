import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cleanActivity,
  mergeActivity,
  type ActivityEvent,
  type ActivityHistory,
} from "../shared/activity";

/** Owner-scoped optional history, separate from mandatory job/quote/replay records. */
export class ActivityStore {
  private pending: Promise<unknown> = Promise.resolve();
  private warnings = new Map<string, string>();
  constructor(private directory: string) {}
  private file(owner: string) {
    return path.join(
      this.directory,
      "activity",
      createHash("sha256").update(owner).digest("hex") + ".json",
    );
  }
  async read(owner: string): Promise<ActivityHistory> {
    try {
      const v = JSON.parse(await readFile(this.file(owner), "utf8"));
      if (typeof v.enabled !== "boolean" || !Array.isArray(v.events))
        throw new Error("Invalid activity history");
      return {
        enabled: v.enabled,
        events: v.events.map(cleanActivity).slice(-200),
        warning: this.warnings.get(owner),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          enabled: false,
          events: [],
          warning: this.warnings.get(owner),
        };
      throw error;
    }
  }
  private update(
    owner: string,
    apply: (state: ActivityHistory) => void | boolean,
  ) {
    const task = this.pending
      .catch(() => {})
      .then(async () => {
        const state = await this.read(owner);
        if (apply(state) === false) return;
        const file = this.file(owner);
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const temp = file + "." + randomUUID();
        await writeFile(
          temp,
          JSON.stringify({ enabled: state.enabled, events: state.events }),
          { mode: 0o600 },
        );
        await rename(temp, file);
        this.warnings.delete(owner);
      });
    this.pending = task;
    return task;
  }
  configure(owner: string, enabled: boolean) {
    return this.update(owner, (s) => {
      s.enabled = enabled;
      if (!enabled) s.events = [];
    });
  }
  append(owner: string, event: ActivityEvent) {
    const clean = cleanActivity(event);
    return this.update(owner, (s) => {
      if (!s.enabled) return false;
      s.events = mergeActivity(s.events, clean);
    });
  }
  /** Logging failure must never turn a successful paid operation into a retry. */
  async observe(owner: string, event: ActivityEvent) {
    try {
      await this.append(owner, event);
    } catch {
      this.warnings.set(
        owner,
        "Some activity could not be saved. Job receipts remain separate; do not rerun completed work.",
      );
    }
  }
  async flush() {
    await this.pending.catch(() => {});
  }
}
