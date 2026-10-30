// The split upscale's shared state (`server/upscale-parts.ts`): the store, a
// set's parts, their runs and quotes. Split from the service by topic.
import type { Quote } from "../shared/quote";
import type { GenerateInput } from "../shared/types";
import {
  partKey,
  type PartPlan,
  type PartSetView,
} from "../shared/upscale-parts";
import { AppError } from "./errors";
import type { JobService } from "./jobs";
import type { StoredPartSet } from "./store";
import { partBudget } from "./upscale-parts-budget";
import { PartSetFollowers } from "./upscale-parts-follow";
import { discardPlan, setView, type PartLimits } from "./upscale-parts-view";

/** What the set needs from the job service; tests stand in for it. */
export type PartJobs = Pick<
  JobService,
  "store" | "quote" | "submit" | "poll" | "source" | "budget" | "credential"
> &
  Partial<Pick<JobService, "settings">>;

type Resolved = { source: import("../shared/types").Source; file: string };
/** The local media work (`server/upscale-media.ts`); tests stand in for it. */
export interface PartMedia {
  plan(from: Resolved, limits: PartLimits): Promise<{ plan: PartPlan }>;
  cut(
    from: Resolved,
    plan: PartPlan,
    sessionId: string,
  ): Promise<Resolved["source"][]>;
  join(
    parts: Resolved[],
    original: Resolved,
    plan: PartPlan,
    sessionId: string,
  ): Promise<Resolved["source"]>;
}

/** The set service's state and lookups; `UpscalePartsService` acts on it. */
export class PartSetCore {
  /** Sets whose parts are being sent or joined now, in this process. */
  protected busy = new Set<string>();
  /** Parts (`<set>:<index>`) whose retry this process is sending now. */
  protected sending = new Set<string>();
  protected followers: PartSetFollowers;
  constructor(
    protected jobs: PartJobs,
    protected media: PartMedia,
    /**
     * How often an approved agent's set is read on its own, so its parts are
     * polled and joined with nobody watching; 0 leaves it to reads.
     */
    followMs = 5000,
  ) {
    this.followers = new PartSetFollowers(followMs);
  }
  protected get store() {
    this.jobs.store.data.partSets ??= [];
    return this.jobs.store;
  }

  protected owned(id: string, sessionId: string) {
    const set = this.store.data.partSets.find(
      (item) => item.id === id && item.sessionId === sessionId,
    );
    if (!set) throw new AppError(404, "Upscale set not found.");
    return set;
  }

  protected partInput(set: StoredPartSet, index: number): GenerateInput {
    return { ...set.input, sourceId: set.parts[index].sourceId };
  }

  protected job(set: StoredPartSet, index: number) {
    const key = partKey(set.id, index, set.parts[index].attempt);
    return this.store.data.jobs.find(
      (job) => job.sessionId === set.sessionId && job.idempotencyKey === key,
    );
  }

  protected quoteRecord(set: StoredPartSet, id: string | undefined) {
    return id
      ? this.store.data.quotes.find(
          (quote) => quote.id === id && quote.sessionId === set.sessionId,
        )
      : undefined;
  }

  /** Whether a quote can still be spent here as it was priced. */
  protected live(set: StoredPartSet, id: string | undefined) {
    const quote = this.quoteRecord(set, id);
    return quote &&
      !quote.jobId &&
      Date.parse(quote.expiresAt) > Date.now() &&
      (this.jobs.settings?.fits(set.sessionId, quote.recipe) ?? true)
      ? quote
      : undefined;
  }

  protected view(set: StoredPartSet): PartSetView {
    return setView(
      this.store,
      set,
      set.parts.map((_, i) => this.job(set, i)),
      (id) => this.quoteRecord(set, id),
      (id) => this.live(set, id),
    );
  }

  protected touch(set: StoredPartSet) {
    set.updatedAt = new Date().toISOString();
    return this.store.save();
  }

  /** Every part quoted, and the set held to the demo budget as a whole. */
  protected async quoteParts(set: StoredPartSet, byoKey?: string) {
    const quotes: Quote[] = [];
    try {
      for (let i = 0; i < set.parts.length; i++)
        quotes.push(
          await this.jobs.quote(this.partInput(set, i), set.sessionId, byoKey),
        );
      partBudget(
        this.jobs,
        this.partInput(set, 0),
        set.sessionId,
        quotes,
        byoKey,
      );
    } catch (error) {
      // A set that cannot be priced leaves no spendable quote behind.
      await discardPlan(
        this.store,
        [],
        quotes.map((quote) => quote.id),
      );
      throw error;
    }
    return quotes;
  }
}
