// A split upscale on the local adapter: a clip longer than one upscale takes,
// cut into parts on frame boundaries, each part its own reserved, idempotent
// upscale, then joined with the source's own sound. One quote and one
// confirmation cover the set; a failed part is retried alone, only with a new
// quote the person confirms. See docs/upscaling.md.
import { randomUUID } from "node:crypto";
import type { Quote } from "../shared/quote";
import { isTerminal } from "../shared/types";
import { partKey, UPSCALE_MAX_SECONDS } from "../shared/upscale-parts";
import type { ApprovalTerms } from "./agent-approvals";
import { AppError } from "./errors";
import type { StoredPartSet } from "./store";
import { PartSetCore } from "./upscale-parts-core";
import { validateInput } from "./validation";
import {
  discardPlan,
  failed,
  partLimits,
  requestKey,
} from "./upscale-parts-view";

export type { PartJobs, PartMedia } from "./upscale-parts-core";

export class UpscalePartsService extends PartSetCore {
  /**
   * Plans, cuts and quotes a split upscale; nothing paid is sent. The same
   * request (every field the provider receives, the part length and the run
   * location) reopens its newest set that has not finished or been declined,
   * rather than cutting and pricing the work twice. A plan that cannot be
   * priced takes its cuts and quotes back.
   */
  async plan(
    body: unknown,
    sessionId: string,
    byoKey?: string,
    /**
     * The session that holds the source: the request's own, or the
     * person's for a clip they picked, read through the agent's scope
     * (`readerOf`). The cuts, the runs and the join stay in `sessionId`.
     */
    sourceSession = sessionId,
  ) {
    const fields =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const { partSeconds, ...request } = fields;
    const input = validateInput(request);
    if (input.generator !== "upscale" || !input.sourceId)
      throw new AppError(400, "Choose a video to upscale.");
    const location = this.jobs.settings?.planFor(
      sessionId,
      "upscale",
      input.model,
    ).location;
    const limits = partLimits(partSeconds, input, location);
    const key = requestKey(input, limits, location);
    const earlier = this.store.data.partSets
      .filter(
        (set) =>
          set.sessionId === sessionId &&
          set.requestKey === key &&
          !set.joinedSourceId &&
          !set.declined,
      )
      .at(-1);
    if (earlier) return this.read(earlier.id, sessionId, byoKey);
    const from = await this.jobs.source(input.sourceId, sourceSession);
    if (
      from.source.duration <= UPSCALE_MAX_SECONDS &&
      from.source.duration <= limits.partSeconds
    )
      throw new AppError(
        400,
        "This clip fits one upscale. Upscale it as usual.",
        "upscale_fits",
      );
    const { plan } = await this.media.plan(from, limits);
    const cuts = await this.media.cut(from, plan, sessionId);
    const now = new Date().toISOString();
    const set: StoredPartSet = {
      id: randomUUID(),
      sessionId,
      sourceId: input.sourceId,
      ...(sourceSession === sessionId ? {} : { sourceSession }),
      input,
      plan,
      parts: cuts.map((cut) => ({ sourceId: cut.id, quoteId: "", attempt: 0 })),
      quoteId: randomUUID(),
      partSeconds: limits.partSeconds,
      requestKey: key,
      createdAt: now,
      updatedAt: now,
    };
    let quotes: Quote[];
    try {
      quotes = await this.quoteParts(set, byoKey);
    } catch (error) {
      await discardPlan(
        this.store,
        cuts.map((cut) => cut.id),
        [],
      );
      throw error;
    }
    quotes.forEach((quote, i) => (set.parts[i].quoteId = quote.id));
    this.store.data.partSets.push(set);
    await this.store.save();
    return { set: this.view(set) };
  }

  list(sessionId: string) {
    return {
      sets: this.store.data.partSets
        .filter((set) => set.sessionId === sessionId)
        .slice(-20)
        .reverse()
        .map((set) => this.view(set)),
    };
  }

  /**
   * Reads the set. Before the confirmation, a quote that lapsed (expired, or
   * the run location changed) is replaced by a new one under a new
   * confirmation id. After it, unfinished parts are polled, and once every
   * part is ready they are joined. Never submits.
   */
  async read(id: string, sessionId: string, byoKey?: string) {
    const set = this.owned(id, sessionId);
    if (!set.confirmation) {
      if (
        !set.declined &&
        set.parts.some((part) => !this.live(set, part.quoteId))
      ) {
        const quotes = await this.quoteParts(set, byoKey);
        if (!set.confirmation) {
          quotes.forEach((quote, i) => (set.parts[i].quoteId = quote.id));
          set.quoteId = randomUUID();
          await this.touch(set);
        }
      }
      return { set: this.view(set) };
    }
    for (let i = 0; i < set.parts.length; i++) {
      const job = this.job(set, i);
      if (job && !isTerminal(job.status) && job.status !== "submitting")
        await this.jobs.poll(job.id, sessionId, byoKey).catch(() => undefined);
    }
    if (!set.joinedSourceId && !set.joinError) await this.join(set);
    return { set: this.view(set) };
  }

  /** Joins once every part is ready; a failed join is kept and can be retried. */
  private async join(set: StoredPartSet) {
    const jobs = set.parts.map((_, i) => this.job(set, i));
    if (!jobs.every((job) => job?.status === "Ready") || this.busy.has(set.id))
      return;
    this.busy.add(set.id);
    try {
      const parts = await Promise.all(
        jobs.map((job) => this.jobs.source(job!.id, set.sessionId)),
      );
      const original = await this.jobs.source(
        set.sourceId,
        set.sourceSession ?? set.sessionId,
      );
      const joined = await this.media.join(
        parts,
        original,
        set.plan,
        set.sessionId,
      );
      set.joinedSourceId = joined.id;
      delete set.joinError;
    } catch (error) {
      set.joinError =
        error instanceof AppError
          ? error.message
          : "The parts could not be joined.";
    } finally {
      this.busy.delete(set.id);
    }
    await this.touch(set);
  }

  /** Tries the join again after a failure; free and local. */
  async rejoin(id: string, sessionId: string) {
    const set = this.owned(id, sessionId);
    delete set.joinError;
    await this.join(set);
    return { set: this.view(set) };
  }

  /**
   * The one confirmation: spends every part's quote, each under its own key.
   * The confirmation is stored before anything is sent; each part's run is
   * reserved by the job service before its submission. A part already
   * reserved is never sent again, whatever its outcome.
   */
  async confirm(
    id: string,
    sessionId: string,
    quoteId: string,
    byoKey?: string,
    /** The person's approval of an agent's set (`server/agent-approvals.ts`). */
    terms?: ApprovalTerms,
  ) {
    const set = this.owned(id, sessionId);
    if (set.declined)
      throw new AppError(
        409,
        "This set was declined. Plan it again.",
        "set_declined",
      );
    if (set.confirmation) {
      if (set.confirmation.quoteId !== quoteId)
        throw new AppError(
          409,
          "This set was confirmed with another quote.",
          "quote_mismatch",
        );
      // Parts never reserved (the server stopped mid-way) go now; no others.
      if (!this.busy.has(set.id)) await this.send(set, byoKey, terms);
      return { set: this.view(set) };
    }
    if (set.quoteId !== quoteId)
      throw new AppError(
        409,
        "This is not the set's current quote. Read the set for its quote.",
        "quote_mismatch",
      );
    if (set.parts.some((part) => !this.live(set, part.quoteId)))
      throw new AppError(
        410,
        "This quote expired or the run location changed. Read the set for a new quote.",
        "quote_expired",
      );
    if (this.busy.has(set.id))
      throw new AppError(409, "This set is being confirmed.", "set_busy");
    set.confirmation = { quoteId, at: new Date().toISOString() };
    // An approved agent's set is marked for following before anything is
    // sent, so a restart mid-send still resumes it (`resumeFollowers`).
    if (terms) set.followed = true;
    // Held from here, so a second confirmation landing while this one is
    // stored finds the set busy and leaves the sending to this one.
    this.busy.add(set.id);
    try {
      await this.touch(set);
    } catch (error) {
      this.busy.delete(set.id);
      throw error;
    }
    await this.send(set, byoKey, terms);
    // Refused before any part was reserved: nothing was sent, so the
    // confirmation goes and the set can be quoted again.
    if (set.parts.every((_, i) => !this.job(set, i))) {
      delete set.confirmation;
      delete set.followed;
      const reason = set.parts[0].refused;
      for (const part of set.parts) delete part.refused;
      await this.touch(set);
      throw new AppError(409, reason ?? "Nothing was sent.", "parts_refused");
    }
    // An agent's set the person approved runs to its join on its own,
    // after a restart too (`resumeFollowers`).
    if (terms) this.follow(set.id, sessionId);
    return { set: this.view(set) };
  }

  /**
   * On start: follows again every approved agent's set that was not yet
   * joined when the server stopped. A failed part does not abandon its
   * unfinished siblings. Reads only; nothing is sent.
   */
  resumeFollowers() {
    for (const set of this.store.data.partSets)
      if (
        set.followed &&
        set.confirmation &&
        !set.joinedSourceId &&
        !set.joinError &&
        !set.declined
      )
        this.follow(set.id, set.sessionId);
  }

  private follow(id: string, sessionId: string) {
    this.followers.start(id, () => this.read(id, sessionId));
  }

  private async send(
    set: StoredPartSet,
    byoKey?: string,
    terms?: ApprovalTerms,
  ) {
    this.busy.add(set.id);
    try {
      for (let i = 0; i < set.parts.length; i++) {
        const part = set.parts[i];
        if (this.job(set, i) || part.refused) continue;
        try {
          await this.jobs.submit(
            this.partInput(set, i),
            set.sessionId,
            partKey(set.id, i, part.attempt),
            byoKey,
            part.quoteId,
            terms && { ...terms, onReserved: undefined },
          );
        } catch (error) {
          if (this.job(set, i)) continue; // reserved: its job holds the outcome
          const reason =
            error instanceof AppError
              ? error.message
              : "The part was not sent.";
          part.refused = reason;
          for (const later of set.parts.slice(i + 1))
            if (!later.refused)
              later.refused = `Not sent: part ${i + 1} was refused.`;
          break;
        }
      }
    } finally {
      this.busy.delete(set.id);
    }
    await this.touch(set);
  }

  /** A new quote for one failed or refused part; nothing is sent. */
  async retry(id: string, index: number, sessionId: string, byoKey?: string) {
    const set = this.owned(id, sessionId);
    const part = this.retriable(set, index);
    const quote = await this.jobs.quote(
      this.partInput(set, index),
      sessionId,
      byoKey,
    );
    part.retry = { quoteId: quote.id };
    await this.touch(set);
    return { set: this.view(set) };
  }

  /** Sends one part again, with the retry quote the person confirmed. */
  async confirmRetry(
    id: string,
    index: number,
    sessionId: string,
    quoteId: string,
    byoKey?: string,
  ) {
    const set = this.owned(id, sessionId);
    const part = this.retriable(set, index);
    if (part.retry?.quoteId !== quoteId)
      throw new AppError(
        409,
        "Confirm this part with its own retry quote.",
        "quote_mismatch",
      );
    const claim = part.retry;
    const previous = part.attempt;
    const sending = `${set.id}:${index}`;
    this.sending.add(sending);
    claim.claimId = randomUUID();
    claim.from = previous;
    part.attempt = previous + 1;
    try {
      await this.touch(set);
      await this.jobs.submit(
        this.partInput(set, index),
        sessionId,
        partKey(set.id, index, part.attempt),
        byoKey,
        quoteId,
      );
    } catch (error) {
      if (!this.job(set, index)) {
        // Nothing reserved: this claim goes, and only while it is still the
        // part's own (`retriable` refuses any other while it stands).
        if (part.retry === claim) {
          part.attempt = previous;
          delete claim.claimId;
        }
        await this.touch(set);
        throw error;
      }
    } finally {
      this.sending.delete(sending);
    }
    if (part.retry === claim) delete part.retry;
    delete part.refused;
    delete set.joinError;
    await this.touch(set);
    if (set.followed) this.follow(set.id, sessionId);
    return { set: this.view(set) };
  }

  private retriable(set: StoredPartSet, index: number) {
    const part = set.parts[index];
    if (!Number.isInteger(index) || !part)
      throw new AppError(404, "Part not found.");
    if (!set.confirmation)
      throw new AppError(409, "Confirm the set first.", "set_not_confirmed");
    // A retry being sent holds the part until it is reserved or refused.
    if (part.retry?.claimId) {
      if (this.sending.has(`${set.id}:${index}`))
        throw new AppError(409, "This part is being sent.", "part_busy");
      this.settleClaim(set, index);
    }
    if (!part.refused && !failed(this.job(set, index)))
      throw new AppError(
        409,
        "Only a failed or refused part can be retried.",
        "part_not_failed",
      );
    return part;
  }

  /**
   * A retry claim no sender holds: the server stopped between storing it and
   * its submission's outcome. A run reserved under its key keeps that
   * outcome (never resent; a new retry needs a new quote); with none, the
   * claim goes and its unspent quote can be confirmed again.
   */
  private settleClaim(set: StoredPartSet, index: number) {
    const part = set.parts[index];
    const claim = part.retry!;
    if (this.job(set, index)) {
      delete part.retry;
      delete part.refused;
    } else {
      part.attempt = claim.from ?? Math.max(0, part.attempt - 1);
      delete claim.claimId;
      delete claim.from;
    }
  }

  /**
   * The person declined the agent's request for this set: it can never be
   * confirmed, and its quotes are voided. Its free cuts stay in the session.
   */
  async decline(quoteId: string, sessionId: string) {
    const set = this.store.data.partSets.find(
      (item) =>
        item.quoteId === quoteId &&
        item.sessionId === sessionId &&
        !item.confirmation,
    );
    if (!set) return false;
    set.declined = true;
    const ids = set.parts.map((part) => part.quoteId);
    this.store.data.quotes = this.store.data.quotes.filter(
      (q) => !ids.includes(q.id) || q.jobId,
    );
    await this.touch(set);
    return true;
  }

  /** What an agent's request for this set shows the person. */
  async proposal(id: string, sessionId: string) {
    const set = this.owned(id, sessionId);
    const quote = this.quoteRecord(set, set.parts[0].quoteId);
    if (!quote || set.confirmation || set.declined) return undefined;
    const view = this.view(set);
    const { source } = await this.jobs.source(
      set.sourceId,
      set.sourceSession ?? sessionId,
    );
    return {
      input: set.input,
      quote: {
        id: set.quoteId,
        estimateUsd: view.estimateUsd,
        recipe: quote.recipe,
        expiresAt: view.expiresAt,
      } satisfies Quote,
      source,
      parts: set.parts.length,
    };
  }
}
