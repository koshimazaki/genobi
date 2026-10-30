import { entryFor } from "../shared/registry";
import type { Job } from "../shared/types";
import { saveRunLocation, selectWorkflow } from "./run-settings";

/**
 * Recreate restores the full setup, so a workflow run made on another
 * template or run location is recreated on its own: the take records both
 * (`recipe.workflow`, `recipe.location`), and they are set for the session
 * before anything can be generated.
 *
 * - Generate waits while a restore is pending (`pending`).
 * - Restores are serialised: each waits for the previous one's writes, and a
 *   restore superseded by a newer Recreate, or by any newer setup choice
 *   (`Generation`), is dropped before it writes and releases its hold.
 * - A take that cannot be read (network, unreadable answer, HTTP error) is
 *   said through `onError`; a run with nothing recorded (a route with no
 *   template, a run from before takes or before templates) changes nothing.
 */
export const RESTORE_FAILED =
  "This run's workflow or run location could not be restored. Check both before generating.";

export interface RestoreIo {
  readTake(jobId: string): Promise<Response>;
  selectWorkflow(entry: string, template: string): Promise<unknown>;
  saveRunLocation(location: "local" | "cloud"): Promise<unknown>;
}
const browserIo: RestoreIo = {
  readTake: (jobId) =>
    fetch(`/api/takes/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      // A read that never answers must not hold Generate forever.
      signal: AbortSignal.timeout(10_000),
    }),
  selectWorkflow,
  saveRunLocation,
};

type Recipe = { id?: unknown; workflow?: unknown; location?: unknown };

/**
 * The generation of the person's setup choices. Every newer choice that
 * touches the model, workflow or run location takes the next one (`next`);
 * a restore holds the one it took and applies nothing once it is not the
 * newest (`current`). The studio shares one across the composer, the settings
 * controls and Recreate (`setupChoices` in `src/settings-store.ts`).
 */
export interface Generation {
  current(): number;
  next(): number;
}
const ownGeneration = (): Generation => {
  let latest = 0;
  return { current: () => latest, next: () => ++latest };
};

export class RunRestorer {
  private running = 0;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly onPending: (pending: boolean) => void = () => {},
    private readonly io: RestoreIo = browserIo,
    private readonly generation: Generation = ownGeneration(),
  ) {}

  get pending() {
    return this.running > 0;
  }

  private async recipeOf(job: Job): Promise<Recipe | null | "failed"> {
    let response: Response;
    try {
      response = await this.io.readTake(job.id);
    } catch {
      return "failed";
    }
    const body = (await response.json().catch(() => undefined)) as
      { take?: { recipe?: Recipe }; code?: unknown } | undefined;
    // A run recorded before takes existed has nothing to restore.
    if (response.status === 404 && body?.code === "take_missing") return null;
    if (!response.ok || !body?.take?.recipe) return "failed";
    return body.take.recipe;
  }

  async restore(job: Job, onError: (message: string) => void) {
    // Every Recreate supersedes the restores before it, even one with nothing
    // to restore: only a workflow run has a template or run location. So does
    // any newer setup choice: a settings save, another clip, another model.
    const id = this.generation.next();
    if (entryFor(job.generator, job.model).route !== "workflow") return;
    const current = () => id === this.generation.current();
    if (this.running++ === 0) this.onPending(true);
    try {
      const recipe = await this.recipeOf(job);
      if (!current()) return;
      if (recipe === "failed") return onError(RESTORE_FAILED);
      if (!recipe) return;
      // Writes run one restore at a time, after any earlier restore's writes.
      const run = this.writes.then(async () => {
        if (!current()) return;
        try {
          if (
            typeof recipe.id === "string" &&
            typeof recipe.workflow === "string"
          )
            await this.io.selectWorkflow(recipe.id, recipe.workflow);
          if (!current()) return;
          if (recipe.location === "local" || recipe.location === "cloud")
            await this.io.saveRunLocation(recipe.location);
        } catch {
          if (current()) onError(RESTORE_FAILED);
        }
      });
      this.writes = run;
      await run;
    } finally {
      if (--this.running === 0) this.onPending(false);
    }
  }
}
